"use strict"

const BaseDBManager = require("./BaseDBManager")
const Connection = require('tedious').Connection;

var Request = require('tedious').Request;
var TYPES = require('tedious').TYPES;


class SQLAzureDBSubscription extends BaseDBManager {


    constructor(connectionConfig) {
        super(connectionConfig);
        this.connection = null;
    }
   
    credentialSqlObject(){
        let connectionProperties = {
            userName: this.connectionConfig.userName,
            password: this.connectionConfig.password,
            server: this.connectionConfig.host,
            port: this.connectionConfig.port,
            options: {
                database: this.connectionConfig.database,
                encrypt: true,
                rowCollectionOnRequestCompletion: true
            }
        };
        return connectionProperties
    }

   openConnection() {
        if (!this.connection) {
            console.log('---------------------------'+ "\n");
             console.log("[LOGS] Openning Subscription SQL Azure connection" + "\n")
            
       
            return new Promise((resolve, reject) => {
                this.connection = new Connection(this.credentialSqlObject());
                this.connection.on('connect', (err) => {
                    if (err)
                        reject(err);
                    else
                        console.log("[LOGS] Connected To: ", this.connectionConfig.database + "\n");
                        console.log("[LOGS] Subscription Database Openned" + "\n")
                        resolve(this);
                });
            });
        }

        return new Promise((resolve, reject) => {
            resolve(this)
        });
    }

    executeStatement(sql, parameters, options) {
        sql = sql.replace(/([ \t]GO)|(\nGO)/gi, "");
        return new Promise((resolve, reject) => {
            let request = new Request(sql, (err, rowCount, rows) => {
                if (err) {
                    console.log('---------------------------' + "\n");
                    console.log('[LOGS][SUBSCRIPTION] Script SQl executed failed: '+ "\n");
                    console.log('---------------------------' + "\n");
                    console.log(sql)
                    console.log('---------------------------' + "\n");
                    reject(err);
                }

                resolve({
                    "rowCount": rowCount,
                    "rows": rows
                });
            });
            if (parameters) {
                parameters.forEach((p) => {
                    request.addParameter(p.name, TYPES[p.type], p.value);
                });
            }
            this.connection.execSql(request);
            
        });
    }

    closeSubscriptionConnection(){
        if (this.connection) {
            console.log('---------------------------'+"\n");
            console.log('[LOGS][SUBSCRIPTION] Subscription SQl Server Azure Closing (%s) [%s]\n', this.connectionConfig.host, this.connectionConfig.database);
            console.log("[LOGS][SUBSCRIPTION] Conexión close for execute security scripts"+ "\n");
            return Promise.resolve(this.connection.close());
        }

        return Promise.resolve("[LOGS][SUBSCRIPTION] ERROR, not exist any connection opened for close"+ "\n");
    }

    closeConnection() {
        if (this.connection) {
            console.log('---------------------------'+"\n");
            console.log('[LOGS][SUBSCRIPTION] close subscription SQl Server Azure (%s) [%s] \n', this.connectionConfig.host, this.connectionConfig.database);
            console.log("[LOGS][SUBSCRIPTION] CONEXION CLOSE SUCCESSFULLY"+ "\n");
            return Promise.resolve(this.connection.close());
        }

        return Promise.resolve("[LOGS][SUBSCRIPTION] ERROR, not exist any connection opened for close" + "\n");
    }

}


module.exports = SQLAzureDBSubscription
