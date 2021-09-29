"use strict"

const applicationArgs = require('yargs').argv;
const fs              = require("fs");
const RepositoryScripts = require('./util/RepositoryScripts');
const Constants = require("./Constants")
 
class AppRunner{

  async run(){
    try {
     if(this.validate(applicationArgs)) {
       await this.getMigrationTask(applicationArgs).runTask()
       console.log('---------------------------'+"\n");
       console.log("[LOGS] Process completed"+ "\n");
       console.log('---------------------------'+"\n");
    }
    else{
       throw new Error(this.getMsgRequiredArgs());
    }
      
    } catch (error) {
       console.log(error)
     throw new Error(error);
    }
  }

     getRepository(args) {
        return new RepositoryScripts({
                env                 : args.env,
                modelsDirectory     : args.modelsDirectory.concat(`/model`),
                scriptDirectory     : args.modelsDirectory.concat(`/${args.env}/${Constants.ACTIONS_TO_FOLDER_TYPE[args.action]}`),
                securityDirectory   : args.modelsDirectory.concat(`/${args.env}/security`),
                channel             : args.channel,     
                folderType          : Constants.ACTIONS_TO_FOLDER_TYPE[args.action],
                project             : args.project,
                versionNumber       : args.v,
                scriptExtension     : this.getExtension(),
                order               : this.getOrderRepository(),
                action              : args.action 
          })
     }

     getOrderRepository(){
        throw new Error('You must implement this method');  
     }    

     getExtension(){
      throw new Error('You must implement this method');  
     } 

     getMigrationTask(args) {
       throw new Error('You must implement this method');  
     }
     
     getDBManager(args) {      
       throw new Error('You must implement this method');  
     }

     getMsgRequiredArgs() {
       throw new Error('You must implement this method');  
     }

     validate(args){
       throw new Error('You must implement this method');  
     }
} 

module.exports = AppRunner
