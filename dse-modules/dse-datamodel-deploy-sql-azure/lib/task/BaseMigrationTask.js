"use strict"

const fs    = require("fs");
const debug = require("debug")("dse-data-model-deploy:migration-task")
const Constants = require("../Constants");

class BaseMigrationTask {
    constructor(args) {
        this.channel              = args.channel
        this.client               = args.client
        this.clientSubscription   = args.clientSubscription
        this.repositoryScripts    = args.repositoryScripts
    }

    async createBaseModelShcl(){
        return this.createSchemaVersioningIfNotExist(Constants.SCHEMA_CONFIG_SHCL)
        .then( () => this.createVersioningMetadataTableIfNotExists(Constants.SCHEMA_CONFIG_SHCL))
        .then( () => this.createHistoricalLogIfNotExists(Constants.SCHEMA_CONFIG_SHCL))
    }

    async runMigrateScripts(scriptFiles){
        //if(scriptFiles.length != 0){
            return scriptFiles.map( script => () => {
                return this.migrateScript(script)}
                )
                .reduce( (p, fn) => p.then(fn), Promise.resolve())
            .then(() => console.log("[log] Execution Migrate scripts status SUCCESSFUL"+"\n"))

        //} else {
        //    console.error('[WARNING] There are no scripts in Migrate Scripts' + "\n")
        //}
    }

    async runSecurityScripts(scriptSecFiles){
        //if(scriptSecFiles.length != 0){
            return scriptSecFiles.map( scriptSec => () => { 
                return this.migrateScript(scriptSec, true)}
                )
                .reduce((p, fn) => p.then(fn), Promise.resolve())
            .then(() => console.log('[log] Execution Security scripts status SUCCESSFUL'+"\n"))
    
    //}   else{
    //    console.error('[WARNING] There are no scripts in Security Scripts' + "\n")
    //}
}

    async closeWholeConnection(channel){
        return this.closeAllConnections();
    }
    
    async runTask(){
        await this.createBaseModelShcl()
        try{
            let scriptFiles = await this.repositoryScripts.getScriptFiles()
            let scriptSecFiles = await this.repositoryScripts.getScriptSecurityFiles()
              if (scriptFiles != null){
                await this.runMigrateScripts(scriptFiles)}
              else {
                console.error('[WARNING] Model folder or Migrate folder does not exist ' + "\n")
                }
              // Logica de script de seguridad

              if (scriptSecFiles != null){
                    await this.runSecurityScripts(scriptSecFiles)}
              else {
                    console.error('[WARNING] Security folder does not exist ' + "\n")
                    }
              await this.closeWholeConnection(this.channel)
        }
        catch (error) {
            console.log('[ERROR] Execution scripts status ERROR'+ "\n")
            console.log(error)
        return this.closeAllConnections()
     }
    }

    async migrateScript(script, isSecurityScript = false) {
        let identifier  = this.client.generateVersioningMetadataId(script.project, script.channel, script.version, script.script_name)

        let sqlObject = {
            id_versioning_metadata     : identifier,
            parent                      : script.parent,
            project                     : script.project,
            version                     : script.version,
            versionName                 : script.versionNumber,
            channel                     : script.channel,
            script_name                 : script.script_name,
            folderType                  : script.folderType,
            script_type                 : script.folderType,
            db_type                     : Constants.SQL_TYPE,    
            state                       : Constants.STATE_SCRIPT_PENDING,
            error                       : Constants.EMPTY_ERROR,
            exec_time                   : this.getCurrentSqlDate(),
            instance                    : this.clientSubscription.connectionConfig.database,
            servername                  : this.clientSubscription.connectionConfig.host,
            action                      : script.action
        }
       return isSecurityScript ? this.runMigrationSecurity(sqlObject) : this.runMigration(sqlObject);
    }
    
       /*
       PRIMER DEPLOY 
       { value: true }
       DOBLE EJECUCION DEPLOY
        SUCCESSFUL
       { value: false, state: 'SUCCESSFUL' }
       */
        /*
       PRIMER REVERT
       { value: true }
       DOBLE EJECUCION REVERT
        { value: false, state: 'SUCCESSFUL' }
       */

   async runMigration(info) {
        let available = await this.availableForRunScript(info)
          if(available.value){
            console.log('[LOGS]  ', info.channel, info.version, info.script_name + "\n")
            let cqlScript       = info.parent + '/' + info.script_name
            let cqlStatement    = fs.readFileSync(cqlScript,"UTF-8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,"").trim()
            let cqlStatements   = cqlStatement.split(';').filter(query => query.length > 0);
            let connection      = this.clientSubscription
        try {
            await cqlStatements.map( stmt =>
                (result) => {
                    return connection.openConnection()
                    .then( cn => cn.executeStatement(stmt))
                 }).reduce((p, fn) => p.then(fn), Promise.resolve())
                 .then(() => {
                    info.state      = 'SUCCESSFUL'
                    info.sqlScript  = cqlStatement
                    return this.persistLog(available, info);
                })
                .then(()=> {
                    return (info.folderType == Constants.FOLDER_TYPE.REVERT) ? this.revertLog(info) : Promise.resolve();
                })
                .then(()=> {
                    return (info.folderType !== Constants.FOLDER_TYPE.REVERT) ? this.putPendingStateMigrateLog(info) : Promise.resolve();
                })

            } catch (error) {
                info.state = 'ERROR'
                info.error = error.message
    
                console.error('[ERROR] An error occurred while migrating %s - %s', info.version, info.script_name + "\n")
                console.error('[ERROR] message: ', error.message +"\n")
               return this.persistLog(available, info)
               .then(
                   () => Promise.reject(error));
            }
        } else {
            console.log(`[log] Not executed script, the current version  ${info.version} for script "${info.script_name}" was already executed ` + "\n")
            return Promise.resolve();   
       }
    }
       

    runMigrationSecurity(info){
        throw new Error('You must implement this method');
    }

    isRevertScript(info){
        return info.script_name.startsWith('R');
    }

    isMigrateScript(info){
        return !info.script_name.startsWith('R');
    }

/** @param {string} schema */
    createSchemaVersioningIfNotExist(schema){
        return this.client
            .openConnection()
            .then(cn=>cn.executeStatement(this.getSchema(schema)));
    }

    createKeyspaceIfNotExist(keyspace){
        return this.client
            .openConnection()
            .then(cn=>cn.executeStatement(this.getKeyspace(keyspace)));
    }

    /** @param {string} scriptTable */
    async createVersioningMetadataTableIfNotExists(scriptTable){
       return this.client
                .openConnection()
                .then(cn=>cn.executeStatement(this.getVersioningTable(scriptTable)));
    }

    /** @param {string} schema */
    async createHistoricalLogIfNotExists(schema){
        return this.client
                .openConnection()
                .then( cn => cn.executeStatement(this.getHistoricalTable(schema)));
    }

    closeAllConnections(){
        return this.clientSubscription.closeConnection().then(() => this.client.closeConnection())
    }

    getHistoricalTable(schema) {
        throw new Error('You must implement this method');
      }

    getVersioningTable(keyspace) {
      throw new Error('You must implement this method');
    }

    getKeyspace(keyspace) {
       throw new Error('You must implement this method');
    }

    getSchema(schema) {
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

    putPendingStateMigrateLog(info){
        throw new Error('You must implement this method');
     }

    getCurrentSqlDate(){
        throw new Error('You must implement this method');
    }

}


module.exports = BaseMigrationTask
