"use strict";

const debug = require("debug")("dse-data-model-deploy:migration-task")
const BaseMigrationTask = require('./BaseMigrationTask');
const Constants = require("../Constants")

class CassandraMigrationTask extends BaseMigrationTask{

    constructor(args) {
        super(args);
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
 
    availableForRunScript(info){
        let cqlStatements=`SELECT * FROM ${Constants.KEYSPACE_DEFAULT}.${Constants.VERSION_TABLE} WHERE project= ? and channel = ? and version = ? and checksum= ?`;

        return this.client
                .openConnection()
                .then(cn=>cn.executeStatement(cqlStatements,[info.project,info.channel,info.version,info.checksum]))
                .then(resultSet=>{
                    if (resultSet.rows.length == 0) {
                        return {value: true};
                    } else {
                        let state = resultSet.rows[0].state
                        return { value: (state!='SUCCESSFUL' || this.isRevertScript(info)), state: state };
                    }
                });
    }

    persistLog(available,info){
        
        let insertMigrationStateCql = `INSERT INTO ${Constants.KEYSPACE_DEFAULT}.${Constants.VERSION_TABLE} (project,channel,version,script_name,checksum,state,error,exec_time)VALUES(:project,:channel,:version,:script_name,:checksum,:state,:error,:exec_time);`
        let updatMigrationsStateCql = `UPDATE ${Constants.KEYSPACE_DEFAULT}.${Constants.VERSION_TABLE} set state = :state,exec_time=:exec_time,error=:error where project= :project  and channel = :channel and version = :version and checksum = :checksum `;
        
        return this.client
            .openConnection()
            .then(cn=>cn.executeStatement(available.state?updatMigrationsStateCql:insertMigrationStateCql,info,{prepare:true}));
    }

    revertLog(info){
        let prefix=info.script_name.startsWith('RM')?'M':'V';
        let regex=RegExp(`^R${prefix}`,"i");

        info.script_name= info.script_name.replace(regex,prefix);
        info.version= info.version.replace(regex,prefix);
        info.checksum=this.client.generateChecksum(info.project,info.channel,info.version,info.script_name);

        let revertCql=`UPDATE ${Constants.KEYSPACE_DEFAULT}.${Constants.VERSION_TABLE} 
                      set state = 'PENDING',exec_time=:exec_time 
                      where project= :project and channel = :channel 
                      and version = :version and checksum= :checksum IF EXISTS; `;

         return this.client
            .openConnection()
            .then(()=>this.client.executeStatement(revertCql,info,{prepare:true}))
            ;
    }

    getCurrentSqlDate(){ return (new Date()).getTime();}

    getVersioningTable(keyspace) {
      return Constants.SCRIPT_CREATE_VERSIONING_TABLE_CASSANDRA.replace(/{{keyspace}}/g,keyspace);
    }

    getKeyspace(keyspace) {
       return Constants.SCRIPT_CREATE_KEYSPACE_CASSANDRA.replace(/{{keyspace}}/g,keyspace).replace('{{replication}}',
            this.client.getKeyspaceReplication(Constants.HAS_ANALYTICS_DEFAULT));
    }

}

module.exports = CassandraMigrationTask