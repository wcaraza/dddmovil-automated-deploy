"use strict"

const applicationArgs = require('yargs').argv;
const fs              = require("fs");
const SQLAzureDBManager = require('./db/SQLAzureDBManager'); 
const SqlAzureMigrationTask = require('./task/SqlAzureMigrationTask'); 
const AppRunner = require('./AppRunner'); 
const Constants = require("./Constants");

class AppSqlAzureRunner extends AppRunner {
    

   getMigrationTask(args) {
         return  new SqlAzureMigrationTask(
             {
                    channel : args.channel,
                    client : this.getDBManager(args),
                    repositoryScripts: this.getRepository(args)   
            }) 
   }

   getDBManager(args) {
         return new SQLAzureDBManager(
              {  
                    userName: args.u,  
                    password: args.p,  
                    host: args.h, 
                    port: 1433,
                    database: JSON.parse(fs.readFileSync(args.properties)).sqldatabase
             });      
   }

   getOrderRepository(){
        return Constants.FIRST_MODEL;  
   }  

   getMsgRequiredArgs() {
       return `
        Missing required parameters
        usage: dse-datamodel-deploy [--env <enviroment> --v <versionNumber> --modelsDirectory <modelsDirectory> --u <username> --p <password>  --h <remoteHosts> --project <project> --properties <properties> --channel <channel> --action <action> ]
       `;
   }

   getExtension(){
      return Constants.SQL_EXTENSION;  
   }

   validate(args){
      return  args.env && args.v && args.modelsDirectory && 
              args.u && args.p && args.h && 
              args.project && args.properties &&
              args.channel && args.action
   }  

}
module.exports = AppSqlAzureRunner

let app = new AppSqlAzureRunner();
app.run();

