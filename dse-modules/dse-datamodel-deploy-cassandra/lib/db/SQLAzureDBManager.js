"use strict"

const BaseDBManager = require("./BaseDBManager")
const Connection = require('tedious').Connection;

var Request = require('tedious').Request;
var TYPES = require('tedious').TYPES;


class SQLAzureDBManager extends BaseDBManager {


    constructor(connectionConfig) {
        super(connectionConfig);
        this.connection = null;
    }

    getOpenedConnection(){
        return new Promise((resolve, reject) => {
                    resolve(this)
                });
    }
    
    openConnection() {

        if (!this.connection) {
            console.log("[log] Open SQL Azure connection");
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

            return new Promise((resolve, reject) => {
                this.connection = new Connection(connectionProperties);
                this.connection.on('connect', (err) => {
                    console.log("[log] Connected: ", this.connectionConfig.database);
                    if (err)
                        reject(err);
                    else
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
                    console.log('---------------------------');
                    console.log('script SQl executed failed: ');
                    console.log('---------------------------');
                    console.log(sql)
                    console.log('---------------------------');
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


    closeConnection() {
        if (this.connection) {
            console.log('[log] close connection SQl Server Azure (%s) [%s]', this.connectionConfig.host, this.connectionConfig.database);
            console.log("[log] CONEXION CLOSE SUCCESSFULLY");
            return Promise.resolve(this.connection.close());
        }

        return Promise.resolve("ERROR, not exist any connection opened for close");
    }

}


module.exports = SQLAzureDBManager
