const fileService = require("../services/file.service");
const User = require("../models/User");
const File = require("../models/File");
const config = require("config");
const fs = require("fs");

class FileController {
    async createDir(req, res) {
        try {
            const { name, type, parent } = req.body;
            const file = new File({ name, type, parent, user: req.user.id });
            const parentFile = await File.findOne({ _id: parent});
            if (!parentFile) {
                file.path = name;
                file.parents = [];
                await fileService.createDir(file);
            } else {
                file.path = `${parentFile.path}\\${file.name}`;
                file.parents = [...parentFile.parents, { name: parentFile.name, parent }];
                await fileService.createDir(file);
                parentFile.childs.push(file._id);
                await parentFile.save();
            }
            await file.save();
            return res.json(file);
        } catch (e) {
            console.log(e);
            return res.status(400).json(e);
        }
    }

    async getFiles(req, res) {
        try {
            const files = await File.find({ user: req.user.id, parent: req.query.parent });
            const parent = await File.findOne({ _id: req.query.parent } );
            return res.json({ parent, files });
        } catch (e) {
            console.log(e);
            return res.status(500).json({ message: "Can not get files" });
        }
    }

    async searchFiles(req, res) {
        try {
            const allFiles = await File.find({ user: req.user.id });
            const filteredFiles = allFiles.filter((file) => file.name.includes(req.query.text))
            return res.json({ files: filteredFiles });
        } catch (e) {
            console.log(e);
            return res.status(500).json({ message: "Something went wrong" });
        }
    }

    async deleteFile(req, res) {
        try {
            const file = await File.findOne({ _id: req.query.id, user: req.user.id });
            const user = await User.findOne({ _id: req.user.id });

            if (!file) {
                return res.status(404).json({ message: "File is not found" });
            }
            fileService.deleteFile(file);
            user.usedSpace = user.usedSpace - file.size;

            user.save();
            file.remove();
            return res.json({ message: "File deleted successfully" });
        } catch (e) {
            console.log(e);
            return res.status(400).json({ message: "Dir is not empty" });
        }
    }

    async uploadFile(req, res) {
        try {
            const file = req.files.file;
            const parent = await File.findOne({ user: req.user.id, _id: req.body.parent });
            const user = await User.findOne({ _id: req.user.id });

            if (user.usedSpace + file.size > user.diskSpace) {
                return res.status(400).json({ message: "There is no space on disk" });
            }

            user.usedSpace = user.usedSpace + file.size;

            let path;
            if (parent) {
                path = `${config.get("filePath")}\\${user._id}\\${parent.path}\\${file.name}`
            } else {
                path = `${config.get("filePath")}\\${user._id}\\${file.name}`
            }

            if (fs.existsSync(path)) {
                return res.status(400).json({ message: "File already exist"});
            }
            file.mv(path);
            const type = file.name.split(".").pop();
            let filePath = file.name;
            if (parent) {
                filePath = parent.path + "\\" + file.name;
            }
            const dbFile = new File({
                name: file.name,
                size: file.size,
                path: filePath,
                parent: parent?.id,
                user: user._id,
                type,
            });

            dbFile.save();
            user.save();

            res.json(dbFile);
        } catch (e) {
            console.log(e);
            return res.status(500).json({ message: "Upload error" });
        }
    }

    async downloadFile(req, res) {
        try {
            const file = await File.findOne({ user: req.user.id, _id: req.query.id});
            const filePath = fileService.getPath(file);
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({ message: "File not found" });
            }
            return res.download(filePath, file.name);
        } catch (e) {
            console.log(e);
            return res.status(500).json({ message: "Download error" });
        }
    }
}

module.exports = new FileController();