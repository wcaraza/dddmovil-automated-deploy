"use strict"

const fs = require("fs")
const debug = require("debug")("dse-data-model-deploy:database-versioner")
const Constants = require("../Constants")

class RepositoryScripts {

    constructor(args) {
        this.env = args.env;
        this.modelsDirectory = args.modelsDirectory;
        this.scriptDirectory = args.scriptDirectory;
        this.securityDirectory = args.securityDirectory;
        this.channel = args.channel;
        this.folderType = args.folderType;
        this.project = args.project;
        this.versionNumber = args.versionNumber;
        this.scriptExtension = args.scriptExtension;
        this.order = args.order
    }

    getScriptFiles() {
          /*                 HERE
        ../../../bcp-shcl-database-template/src/TEST/sql//model
        ../../../bcp-shcl-database-template/src/TEST/sql//des/migrate
        ../../../bcp-shcl-database-template/src/TEST/sql//des/security
        TEST
        migrate
        bcp-shcl-database-template
        1
        .sql
        FIRST_MODEL 
        1. MODEL
        2. MIGRATE
        */
        try {
            let pModel = null
            let pScript = null
            let orderDirectories = null

            if (this.folderType == Constants.FOLDER_TYPE.REVERT) {

                pModel = this.getSortedReverseScriptFiles(this.scriptDirectory, Constants.FOLDER_TYPE.REVERT, "RV");

                pScript = this.getSortedReverseScriptFiles(this.scriptDirectory, Constants.FOLDER_TYPE.REVERT, "RM");

                orderDirectories = (this.scriptExtension == Constants.SQL_EXTENSION) ? [pScript, pModel] : [pModel, pScript];

            } else {
                if (fs.existsSync(this.modelsDirectory)) {
                    pModel = this.getSortedScriptFiles(this.modelsDirectory, Constants.FOLDER_TYPE.MODEL, "V");
                }
                if (fs.existsSync(this.scriptDirectory)) {
                    pScript = this.getSortedScriptFiles(this.scriptDirectory, Constants.FOLDER_TYPE.MIGRATE, "M");
                }

                if (pModel == null) {
                    orderDirectories = [pScript]
                } else if (pScript == null) {
                    orderDirectories = [pModel]
                } else {
                    orderDirectories = (this.order == Constants.FIRST_MODEL) ? [pModel, pScript] : [pScript, pModel]
                }
            }

            return new Promise((resolve, reject) => {
                Promise.all(orderDirectories)
                    .then(x => {
                        let scriptFiles = (orderDirectories.length == 1) ? x[0] : x[0].concat(x[1]);
                        resolve(scriptFiles);
                    });
            });
        } catch (err) {
            return Promise.reject(err);
        }

    }

    getScriptSecurityFiles() {
        try {
            if (this.env == "des" && fs.existsSync(this.securityDirectory)) {
                
                if (this.folderType == Constants.FOLDER_TYPE.REVERT){
                    return this.getSortedReverseScriptFiles(this.scriptDirectory, Constants.FOLDER_TYPE.REVERT, "RS");
                }else{

                    return this.getSortedScriptFiles(this.securityDirectory, Constants.FOLDER_TYPE.SECURITY, "S");
                }
            }
            return Promise.resolve([]);
        } catch (err) {
            return Promise.reject(err);
        }

    }

    getSortedScriptFiles(path, folderType, startWith) {
        return this.getSortedScriptFilesExclude(path, folderType, (fileName) => fileName.startsWith(startWith), Constants.SORT_DIRECTION.ASC)
    }

    getSortedReverseScriptFiles(path, folderType, startWith) {        
        return this.getSortedScriptFilesExclude(path, folderType, (fileName) => fileName.startsWith(startWith), Constants.SORT_DIRECTION.DESC)
    }

    getSortedScriptFilesExclude(path, folderType, predicate, direction) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (error, dir) => {
                if (error) {
                    return reject(error); 
                } else {
                    let prefix = Constants.TYPE_PREFIX[folderType];
                    let files = dir
                        .filter(fileName => 
                        fileName.indexOf(this.scriptExtension) > -1 && RegExp('^(' + prefix + ')', 'i').test(fileName))
                        .filter(predicate)
                        .map(fileName => {
                            return {
                                project: this.project,
                                channel: this.channel,
                                version: fileName.match(/(S|V|M|RM|RV|RS)(\d+_\d+)+/gi)[0],
                                script_name: fileName,
                                parent: path,
                                folderType: this.folderType
                            }
                        })
                        .sort((a, b) => {
                            let v1 = a.script_name.match(/(S|V|M|RM|RV)(\d+_\d+)+/gi)[0].replace('_', '.').replace(/(S|V|M|RM|RV)/gi, '')
                            let v2 = b.script_name.match(/(S|V|M|RM|RV)(\d+_\d+)+/gi)[0].replace('_', '.').replace(/(S|V|M|RM|RV)/gi, '')
                            return direction == Constants.SORT_DIRECTION.ASC ? v1 - v2 : v2 - v1;
                        });
                    
               
                    if (this.versionNumber && !isNaN(this.versionNumber)) {
                        files = files.filter(f => f.script_name.match(/\d+/i) == this.versionNumber);
                    }
                    console.log(files)
                    return resolve(files);
                }
            });
        })
    }

}

module.exports = RepositoryScripts
