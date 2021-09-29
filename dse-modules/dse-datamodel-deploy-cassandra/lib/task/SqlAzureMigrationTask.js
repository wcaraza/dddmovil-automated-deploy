"use strict";

const debug = require("debug")("dse-data-model-deploy:migration-task")
const BaseMigrationTask = require('./BaseMigrationTask');
const Constants = require("../Constants");
const fs = require('fs')

class SqlAzureMigrationTask extends BaseMigrationTask {

    constructor(args) {
        super(args);
        this.databaseName = this.client.connectionConfig.database;
    }
    getCurrentConnection() {
        if(this.client.connectionConfig.database == "master"){
            console.log("[LOG] Closing Master to insert Into versioning_metadata")
            this.closeConnections();
            this.client.connection = null;
            this.client.connectionConfig.database = this.databaseName;
            return this.client.openConnection();
        }
        return this.client.getOpenedConnection();
    }

    getConnection(scriptName) {
        //clean current connection for open connection in new database    
        this.closeConnections();
        this.client.connection = null;

        if (scriptName.indexOf("LOGIN") != -1) {
            this.client.connectionConfig.database = "master"
        }
         else {
            this.client.connectionConfig.database = this.databaseName;
        }

        return this.client.openConnection();
    }

    runMigrationSecurity(info) {
        
        return this.availableForRunScript(info)
            .then(available => {
                if (available.value) {
                    console.log('[log] Processing security script', info.channel, info.version, info.script_name)

                    let cqlScript = info.parent + '/' + info.script_name
                    let cqlStatement = fs.readFileSync(cqlScript, "UTF-8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").trim()
                    let cqlStatements = cqlStatement.split(';').filter(query => query.length > 0);

                    return cqlStatements
                        .map(stmt => 
                        (result) => {
                             return this.getConnection(info.script_name)
                             .then(cn =>
                              cn.executeStatement(stmt))
                            })
                        .reduce((p, fn) => p.then(fn), Promise.resolve())
                        .then(() => {
                            info.state = 'SUCCESSFUL'
                            return this.persistLog(available, info);
                        })
                        .then(() => 
                        {
                            return (
                                info.folderType == Constants.FOLDER_TYPE.REVERT) ?
                                 this.revertLog(info) :
                                  Promise.resolve();
                        })
                        .catch(e => {
                            info.state = 'ERROR'
                            info.error = e.message

                            console.error('[ERROR] An error occurred while security script %s -' +
                                ' %s', info.version, info.script_name)
                            console.error('[ERROR] message: ', e.message)

                            return this.persistLog(available, info).then(() => Promise.reject(e));
                        });
                } else {
                    console.log(`[log] Not executed security script, the current version  ${info.version} for script "${info.script_name}" was already executed `)
                    return Promise.resolve();
                }
            });
    }
    
    availableForRunScript(info) {
        let cqlStatements = `SELECT * FROM [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] WHERE project = '${info.project}' and channel = '${info.channel}' and [version] = '${info.version}' and [checksum]= '${info.checksum}' `;

        return this.client
            .openConnection()
            .then(cn => cn.executeStatement(cqlStatements))
            .then((resultSet) => {
                if (resultSet.rowCount == 0) {
                    return {value: true};
                } else {
                    let state = resultSet.rows[0].filter(columns => columns.metadata.colName == 'state')[0].value
                    return {
                        value: (state != 'SUCCESSFUL' || this.isRevertScript(info)),
                        state: state
                    };
                }
            });
    }

    persistLog(available, info) {

        let sqlParams = [
            {name: 'project', type: 'NVarChar', value: info.project},
            {name: 'channel', type: 'NVarChar', value: info.channel},
            {name: 'version', type: 'NVarChar', value: info.version},
            {name: 'script_name', type: 'NVarChar', value: info.script_name},
            {name: 'checksum', type: 'NVarChar', value: info.checksum},
            {name: 'state', type: 'NVarChar', value: info.state},
            {name: 'error', type: 'NVarChar', value: info.error},
            {name: 'exec_time', type: 'DateTime', value: info.exec_time}
        ];
    
        let insertMigrationStateSql = `INSERT INTO [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] (project,channel,version,script_name,checksum,state,error,exec_time) VALUES(@project,@channel,@version,@script_name,@checksum,@state,@error,@exec_time)`;
        let updatMigrationsStateSql = `UPDATE [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] set state =@state,exec_time= @exec_time,error=@error where project = @project and channel = @channel and [version] = @version and [checksum] = @checksum `
        
        return this.getCurrentConnection()
            .then(cn => cn.executeStatement(available.state ? updatMigrationsStateSql : insertMigrationStateSql, sqlParams));
    }
    
    prefixLogVersion(info){
            if(info.script_name.startsWith('RM')){
                return 'M'
            }
            else if(info.script_name.startsWith('RV')){
                return 'V'
            }
            else{
                return 'S'
            }
        }

    revertLog(info) {

        let prefix = this.prefixLogVersion(info);
        let regex = RegExp(`^R${prefix}`, "i");
        
        let sqlParams = [
            {name: 'project', type: 'NVarChar', value: info.project},
            {name: 'channel', type: 'NVarChar', value: info.channel},
            {
                name: 'version',
                type: 'NVarChar',
                value: info.version.replace(regex, prefix)},
            {
                name: 'checksum',
                type: 'NVarChar',
                value: this.client.generateChecksum(
                    info.project,
                    info.channel,
                    info.version.replace(regex, prefix),
                    info.script_name.replace(regex, prefix)
                    )
            },
            {name: 'exec_time', type: 'DateTime', value: info.exec_time}
        ]

        let revertSql = `UPDATE [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] set state ='PENDING',exec_time= @exec_time where project = @project and channel = @channel and version = @version and checksum = @checksum `

        return this.getCurrentConnection()
            .then(() => this.client.executeStatement(revertSql, sqlParams))
    }


    getCurrentSqlDate() {
        return new Date();
    }

    getExtension() {
        return Constants.SQL_EXTENSION;
    }

    getVersioningTable(keyspace) {
        return Constants.SCRIPT_CREATE_VERSIONING_TABLE_SQL.replace(/{{keyspace}}/g, keyspace);
    }

    getKeyspace(keyspace) {
        return Constants.SCRIPT_CREATE_SCHEMA_SQL.replace(/{{keyspace}}/g, keyspace);
    }

}

module.exports = SqlAzureMigrationTask