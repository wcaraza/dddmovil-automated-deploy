"use strict"

class Constants{

    static get SQL_TYPE() { return "sql"};
    static get CASSANDRA_TYPE() { return "cassandra"}; 
    static get CASSANDRA_EXTENSION(){ return ".cql"};
    static get SQL_EXTENSION(){return ".sql"}
    static get IS_SUBSCRIPTION(){return true}
    static get VERSION_TABLE() { return 'model_versioning'};
    static get HISTORICAL_SCRIPTS() { return 'model_versioning_log'};
    static get VERSION_KEYSPACE() {return 'versioning'}
    static get KEYSPACE_DEFAULT() {return 'conf'}    
    static get SCHEMA_SHCL() { return 'shcl'}
    static get SCHEMA_CONFIG_SHCL() { return 'conf'}
    static get HAS_ANALYTICS_DEFAULT() { return 'true'}
    static get FIRST_MODEL() { return 'FIRST_MODEL'}
    static get FIRST_SCRIPTS(){return 'FIRST_SCRIPTS'}
    static get STATE_SCRIPT_PENDING() { return 'PENDING'}
    static get EMPTY_ERROR() { return ''}
    static get ACTION_DEPLOY(){return 'deploy'}
    static get ACTION_REVERT(){return 'revert'}

    static get ACTIONS_TO_FOLDER_TYPE(){
        let actionsToFolderType={};
        actionsToFolderType[this.ACTION_DEPLOY]= this.FOLDER_TYPE.MIGRATE
        actionsToFolderType[this.ACTION_REVERT]= this.FOLDER_TYPE.REVERT
        return actionsToFolderType;
    } 

    static get FOLDER_TYPE(){
        return {MODEL:"model",MIGRATE:"migrate",REVERT:"revert",SECURITY:"security"};
    }

    static get SORT_DIRECTION(){
        return {ASC:1,DESC:-1};
    }

    static get TYPE_PREFIX(){
        let prefix={};
        prefix[this.FOLDER_TYPE.MODEL]="V"
        prefix[this.FOLDER_TYPE.MIGRATE]="M"
        prefix[this.FOLDER_TYPE.REVERT]="R"
        prefix[this.FOLDER_TYPE.SECURITY]="S"
        return prefix;
    }

    static get SCRIPT_CREATE_SCHEMA_SQL(){
        return `IF NOT EXISTS (SELECT name FROM sys.schemas WHERE name = N'{{keyspace}}')
                BEGIN
                    EXEC('CREATE SCHEMA [{{keyspace}}]');
                END`;
    }

    static get SCRIPT_CREATE_KEYSPACE_CASSANDRA(){
        return 'create keyspace if not exists {{keyspace}} with replication = {{replication}} ;';
    }

    static get SCRIPT_CREATE_VERSIONING_TABLE_SQL(){
        return `
        if not exists (select * from INFORMATION_SCHEMA.TABLES where TABLE_NAME='model_versioning' and TABLE_SCHEMA=  N'{{keyspace}}' )
        create table {{keyspace}}.model_versioning(
            error varchar(MAX),
            project varchar(200),
            channel varchar(200),
            [version] varchar(200),
            script_name varchar(200),
		    script_type varchar(200),
            [state] varchar(MAX),
	        exec_time datetime,
            db_type varchar(200),
            instance varchar(200),
			servername varchar(200),
			id_versioning_metadata varchar(200) NOT NULL PRIMARY KEY,
        UNIQUE(project, script_name, id_versioning_metadata));
        `;
    }
    
    static get SCRIPT_CREATE_VERSIONING_LOG_SQL(){
        return `
        if not exists (select * from INFORMATION_SCHEMA.TABLES where TABLE_NAME='model_versioning_log' and TABLE_SCHEMA= N'{{keyspace}}')
        create table {{keyspace}}.model_versioning_log(
                script varchar(max),
                exec_time datetime,
                versioning_metadata_id varchar(200) NOT NULL,
            CONSTRAINT FK_VersionnigLog_versioning_metadata FOREIGN KEY (versioning_metadata_id)     
            REFERENCES {{keyspace}}.model_versioning (id_versioning_metadata)     
            ON DELETE CASCADE
            ON UPDATE CASCADE
    );
    GO
        `;
    }

    static get SCRIPT_CREATE_VERSIONING_TABLE_CASSANDRA(){
        return `
            create table if not exists {{keyspace}}.versioning_metadata(
                project text,
                channel text,
                version text,
                script_name text,
                checksum text,
                state text,
                exec_time timestamp,
                error text,
                primary key (project,channel,version,checksum)
            );
        `;
    }

}



module.exports=Constants
