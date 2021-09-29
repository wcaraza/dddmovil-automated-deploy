"use strict"

const BaseDBManager = require("./BaseDBManager");
const dse        = require("dse-driver");
const fs         = require("fs")
const debug      = require("debug")("dse-data-model-deploy:database-versioner")


class CassandraDBManager extends BaseDBManager{


    constructor(connectionConfig){
      super(connectionConfig);
      this.connection=null;
      this.keyspaceReplication=null;
    }

    openConnection(){

        if(!this.connection){
            console.log("[log] Open Cassandra connection");

            let clientOpts = {
                contactPoints: this.connectionConfig.contactPoints,
                authProvider: new dse.auth.DsePlainTextAuthProvider(this.connectionConfig.userName,this.connectionConfig.password)
            };

            if (this.connectionConfig.key &&  this.connectionConfig.cert){ 
                clientOpts.sslOptions = {
                    key: fs.readFileSync(this.connectionConfig.key ),
                    cert: fs.readFileSync( this.connectionConfig.cert)           
                }
            }
                        
            this.connection = new dse.Client(clientOpts)

            console.log('[log] Connected');
        }


        return new Promise((resolve,reject)=>{
            resolve(this)
        });
      
    }


    executeStatement(sql,parameters,options){
        return this.connection.execute(sql,parameters,options);
    }

    closeConnection(){
      if(this.connection){
        return this.connection.shutdown()
            .then(()=>{
                console.log('[log] close connection Cassandra (%s)',this.connectionConfig.contactPoints);
                console.log("[log] CONEXION CLOSE SUCCESSFULLY"); 
            });
      }

      return Promise.resolve("ERROR, not exist any connection opened for close");
    }

/*     getKeyspaceReplication(hasAnalytics){
    let replication_strategy            = 'SimpleStrategy';
    let transactional_replicationFactor = 1
    let replication =  "{'class': '"+ replication_strategy + "','"+ "replication_factor' : " + transactional_replicationFactor + "}";
    let replication2 =  "{'class': 'SimpleStrategy', 'replication_factor': 1 '}'"

    return replication; }*/
   
    
   getKeyspaceReplication(hasAnalytics){
     let replication = this.connectionConfig.keyspaceConfig.keyspace.replication 
     return "{'class':'"+ replication.strategy+"','"+replication.datacenters.transactional.name+"':"+replication.datacenters.transactional.replicationFactor+
        (hasAnalytics== 'true'?",'"+replication.datacenters.analytics.name+"':"+replication.datacenters.analytics.replicationFactor:"") + "}";
   } 
    }



module.exports = CassandraDBManager