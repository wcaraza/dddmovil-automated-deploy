"use strict"

const fs    = require("fs");
const debug = require("debug")("dse-data-model-deploy:migration-task")
const Constants = require("../Constants");

class BaseMigrationTask {


    constructor(args) {
        this.channel = args.channel
        this.client = args.client
        this.repositoryScripts = args.repositoryScripts
    }

    run(){
       return this.createKeyspaceIfNotExist(Constants.KEYSPACE_DEFAULT)
            .then( () => this.createVersioningMetadataTableIfNotExists(Constants.KEYSPACE_DEFAULT))
            .then(() =>
                    this.repositoryScripts.getScriptFiles()
                    .then(scriptFiles =>
                     scriptFiles.map(script =>
                      () => {
                           return this.migrateScript(script) 
                        })
                    .reduce((p, fn) => p.then(fn), Promise.resolve()))
            )
            .then(()=>
                  {
                         //TODO - probar metodo para ejecutar logica de script de seguridad]
                   return this.repositoryScripts.getScriptSecurityFiles()
                    .then(scriptSecFiles => 
                    scriptSecFiles.map(scriptSec =>
                     () => { 
                        return this.migrateScript(scriptSec, true)
                     }
                     ).reduce(
                         (p, fn) => 
                         p.then(fn),
                          Promise.resolve())
                          )
                  }
            )
            .then(()=>{
                console.log('[log] Execution scripts status SUCCESSFUL')
                return this.closeConnections();
            })

            .catch(e => {
                console.log('[ERROR] Execution scripts status ERROR')
                console.log(e)
                return this.closeConnections()
            });
    }

    migrateScript(script, isSecurityScript) {
        let info = {
            parent: script.parent,
            project:script.project,
            version: script.version,
            channel: script.channel,
            script_name: script.script_name,
            folderType:script.folderType,
            checksum: this.client.generateChecksum(script.project,script.channel,script.version,script.script_name),
            state: 'PENDING',
            error: '',
            exec_time: this.getCurrentSqlDate()
        }
        
       return isSecurityScript ? this.runMigrationSecurity(info) : this.runMigration(info);
    }

    runMigration(info) {

        return this.availableForRunScript(info)
                .then(available=>{
                    if(available.value){
                       console.log('[log] Processing migration ',info.channel,info.version,info.script_name)

                       let cqlScript = info.parent + '/' + info.script_name
                       let cqlStatement = fs.readFileSync(cqlScript,"UTF-8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,"").trim()
                       let cqlStatements = cqlStatement.split(';').filter(query => query.length > 0);
                       let connection = this.client

                       return cqlStatements
                            .map(stmt =>
                            (result) => {
                                return connection.openConnection().then(cn=>cn.executeStatement(stmt)) })
                            .reduce((p, fn) => p.then(fn), Promise.resolve())
                            .then(() => {
                                info.state = 'SUCCESSFUL'
                                return this.persistLog(available,info);
                            })
                            .then(()=>{
                                return (info.folderType==Constants.FOLDER_TYPE.REVERT)?this.revertLog(info):Promise.resolve();
                            })
                            .catch(e => {
                                info.state = 'ERROR'
                                info.error = e.message

                                console.error('[ERROR] An error occurred while migrating %s - %s', info.version, info.script_name)
                                console.error('[ERROR] message: ',e.message)

                               return this.persistLog(available,info).then(()=>Promise.reject(e));
                            });
                    }else{
                         console.log(`[log] Not executed script, the current version  ${info.version} for script "${info.script_name}" was already executed `)
                         return Promise.resolve();
                    }
                });
    }

    runMigrationSecurity(info){
        throw new Error('You must implement this method');
    }

    isRevertScript(info){
        return info.script_name.startsWith('R');
    }

    createKeyspaceIfNotExist(keyspace){
        return this.client
            .openConnection()
            .then(cn=>cn.executeStatement(this.getKeyspace(keyspace)));
    }

    createVersioningMetadataTableIfNotExists(keyspace){
       return this.client
                .openConnection()
                .then(cn=>cn.executeStatement(this.getVersioningTable(keyspace)));
    }

    closeConnections(){
       return this.client.closeConnection();
    }

    getVersioningTable(keyspace) {
      throw new Error('You must implement this method');
    }

    getKeyspace(keyspace) {
       throw new Error('You must implement this method');
    }

    availableForRunScript(checksum){
        throw new Error('You must implement this method');
    }

    persistLog(available,info){
       throw new Error('You must implement this method');
    }

    revertLog(info){
       throw new Error('You must implement this method');
    }

    getCurrentSqlDate(){
        throw new Error('You must implement this method');
    }

}


module.exports = BaseMigrationTask
