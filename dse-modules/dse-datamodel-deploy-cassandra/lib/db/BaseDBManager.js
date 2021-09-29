"use strict"
const crypto = require('crypto');

class BaseDBManager {

    constructor(connectionConfig){
      this.connectionConfig=connectionConfig;
    }


    openConnection(){
      throw new Error('You must implement this method');
    }

    executeStatement(sql,parameters,options){
      throw new Error('You must implement this method');
    }

    closeConnection(){
       throw new Error('You must implement this method');
    }

    generateChecksum(project,channel,version,scriptname){   
        var str = `${project}|${channel}|${version}|${scriptname}`;
        var generatedCheckSum = crypto.createHash('md5').update(str).digest("hex");
        return generatedCheckSum;
    }

    verifyChecksum(project,channel,version,scriptname,checksum){
        var str = `${project}|${channel}|${version}|${scriptname}`;
        var generatedCheckSum = crypto.createHash('md5').update(str).digest("hex");

        return generatedCheckSum == checksum;
    }   

}


module.exports = BaseDBManager