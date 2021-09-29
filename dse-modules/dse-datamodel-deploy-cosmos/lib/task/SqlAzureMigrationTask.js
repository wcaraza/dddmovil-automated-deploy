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

    async getCurrentConnection() {
        if(this.client.connectionConfig.database == "master"){
        console.log("[LOG] Closing Master to insert Into model_versioning"+ "\n")
        await this.client.closeConnection();
        this.client.connection = null;
        this.client.connectionConfig.database = this.databaseName;
        return await this.client.openConnection();
    }

    return await this.client.openConnection();
    }

    availableForRunScript(info) {
        let cqlStatements = `SELECT * FROM [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] WHERE project = '${info.project}' and script_name = '${info.script_name}' and [id_versioning_metadata]= '${info.id_versioning_metadata}' `;

        return this.client
            .openConnection()
            .then(cn => cn.executeStatement(cqlStatements))
            .then((resultSet) => {
                if (resultSet.rowCount == 0) {
                    return { value: true };
                } else {
                    let state = resultSet.rows[0].filter(columns => columns.metadata.colName == 'state')[0].value
                    return {
                        value: (info.action == 'deploy') ? (state != 'SUCCESSFUL' || this.isRevertScript(info)) :
                         (state != 'SUCCESSFUL' || this.isMigrateScript(info)),
                        state: state
                    };
                }
            });
    }
    async insertHistorialScript(info){
        let sqlParams = [
            { name: 'script',                  type: 'NVarChar',     value: info.sqlScript               },
            { name: 'exec_time',               type: 'DateTime',     value: info.exec_time               },
            { name: 'id_versioning_metadata', type: 'NVarChar',     value: info.id_versioning_metadata }
        ];

        let insertMigrationStateSql =  `INSERT INTO [${Constants.KEYSPACE_DEFAULT}].[${Constants.HISTORICAL_SCRIPTS}] (script, exec_time, versioning_metadata_id) VALUES (@script, @exec_time, @id_versioning_metadata);`;
        return this.getCurrentConnection()
            .then(cn => cn.executeStatement(insertMigrationStateSql, sqlParams));
    }

    persistLog(available, info) {
        let sqlParams = [
            { name: 'project',                 type: 'NVarChar',     value: info.project                 },
            { name: 'error',                   type: 'NVarChar',     value: info.error                   },
            { name: 'channel',                 type: 'NVarChar',     value: info.channel                 },
            { name: 'version',                 type: 'NVarChar',     value: info.versionName             },
            { name: 'script_name',             type: 'NVarChar',     value: info.script_name             },
            { name: 'state',                   type: 'NVarChar',     value: info.state                   },
            { name: 'id_versioning_metadata', type: 'NVarChar',     value: info.id_versioning_metadata },
            { name: 'script_type',             type: 'NVarChar',     value: info.script_type             },
            { name: 'db_type',                 type: 'NVarChar',     value: info.db_type                 },
            { name: 'instance',                type: 'NVarChar',     value: info.instance                },
            { name: 'exec_time',               type: 'DateTime',     value: info.exec_time               },
            { name: 'servername',              type: 'NVarChar',     value: info.servername              }
        ];

        let insertMigrationStateSql = `INSERT INTO [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] (error, project, channel, version, script_name, script_type, state, exec_time, db_type, instance, servername, id_versioning_metadata) VALUES (@error, @project, @channel, @version, @script_name, @script_type, @state, @exec_time, @db_type, @instance, @servername, @id_versioning_metadata);`;

        let updatMigrationsStateSql = `UPDATE [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] set state =@state, exec_time= @exec_time, error=@error WHERE project = @project and script_name = @script_name and id_versioning_metadata = @id_versioning_metadata;`
        
        return this.getCurrentConnection()
            .then( cn => cn.executeStatement( available.state ? updatMigrationsStateSql : insertMigrationStateSql, sqlParams))
            .then( () => this.insertHistorialScript(info))
    }
    
    prefixMigrateLogVersion(info){
            if(info.script_name.startsWith('RM')){
                return 'M'
            }
            else if(info.script_name.startsWith('RV')){
                return 'V'
            }
//            else{
//                return 'S'
//            }
        }

    regexRevertLogVersion(info){
        if(info.script_name.startsWith('M')){
            return 'M'
        }
        else if(info.script_name.startsWith('V')){
            return 'V'
        }
//        else{
//            return 'S'
//        }
    }

    prefixRevertLogVersion(info){
        if(info.script_name.startsWith('M')){
            return 'RM'
        }
        else if(info.script_name.startsWith('V')){
            return 'RV'
        }
//        else{
//            return 'RS'
//        }
    }

    revertLog(info) {
        let prefix       = this.prefixMigrateLogVersion(info);
        let regex        = RegExp(`^R${prefix}`, "i");
        let identifier   = this.client.generateVersioningMetadataId(info.project, info.channel, info.version.replace(regex, prefix), info.script_name.replace(regex, prefix));
        let script_name  = info.script_name.replace(regex, prefix)
        
        let sqlParams = [
            { name: 'project'                    , type: 'NVarChar'              , value: info.project     },
            { name: 'channel'                    , type: 'NVarChar'              , value: info.channel     },
            { name: 'exec_time'                  , type: 'DateTime'              , value: info.exec_time   },
            { name: 'script_name'                , type: 'NVarChar'              , value: script_name      },
            { name: 'version'                    , type: 'NVarChar'              , value: info.versionName },
            { name: 'id_versioning_metadata'    , type: 'NVarChar'              , value: identifier       }
        ]
        let revertSql = `UPDATE [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] set state ='PENDING', exec_time= @exec_time WHERE project = @project and script_name = @script_name and id_versioning_metadata = @id_versioning_metadata;`
        return this.getCurrentConnection()
            .then( () => this.client.executeStatement(revertSql, sqlParams))
    }

    putPendingStateMigrateLog(info) {
        let valueToReplace   = this.prefixRevertLogVersion(info);
        let regex            = RegExp(`^${this.regexRevertLogVersion(info)}`, "i");
        let identifier   = this.client.generateVersioningMetadataId(info.project, info.channel, info.version.replace(regex, valueToReplace), info.script_name.replace(regex, valueToReplace));
        let script_name  = info.script_name.replace(regex, valueToReplace)

        let sqlParams = [
            { name: 'project'                    , type: 'NVarChar'              , value: info.project     },
            { name: 'channel'                    , type: 'NVarChar'              , value: info.channel     },
            { name: 'exec_time'                  , type: 'DateTime'              , value: info.exec_time   },
            { name: 'script_name'                , type: 'NVarChar'              , value: script_name      },
            { name: 'version'                    , type: 'NVarChar'              , value: info.versionName },
            { name: 'id_versioning_metadata'    , type: 'NVarChar'              , value: identifier       }
        ]

        let revertSql = `UPDATE [${Constants.KEYSPACE_DEFAULT}].[${Constants.VERSION_TABLE}] set state ='PENDING', exec_time= @exec_time WHERE project = @project and script_name = @script_name and id_versioning_metadata = @id_versioning_metadata;`
        return this.getCurrentConnection()
            .then( () => this.client.executeStatement(revertSql, sqlParams))
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

    getHistoricalTable(schema){
        return Constants.SCRIPT_CREATE_VERSIONING_LOG_SQL.replace(/{{keyspace}}/g, schema);
    }

    getKeyspace(keyspace) {
        return Constants.SCRIPT_CREATE_SCHEMA_SQL.replace(/{{keyspace}}/g, keyspace);
    }

    getSchema(schema) {
        return Constants.SCRIPT_CREATE_SCHEMA_SQL.replace(/{{keyspace}}/g, schema);
    }

}

module.exports = SqlAzureMigrationTask