"use strict"

class Constants{

    static get SQL_TYPE() { return "sql"};
    static get CASSANDRA_TYPE() { return "cassandra"}; 
    static get CASSANDRA_EXTENSION(){ return ".cql"};
    static get SQL_EXTENSION(){return ".sql"}
    static get VERSION_TABLE() { return 'versioning_metadata'};
    static get VERSION_KEYSPACE() {return 'versioning'}
    static get KEYSPACE_DEFAULT() {return 'shcl'}
    static get HAS_ANALYTICS_DEFAULT() { return 'true'}
    static get FIRST_MODEL() { return 'FIRST_MODEL'}
    static get FIRST_SCRIPTS(){return 'FIRST_SCRIPTS'}
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
             if not exists (select * from INFORMATION_SCHEMA.TABLES where TABLE_NAME='versioning_metadata' and TABLE_SCHEMA='{{keyspace}}' )
            create table {{keyspace}}.versioning_metadata(
            project varchar(400),
            channel varchar(200),
            [version] varchar(200),
            script_name varchar(200),
            [checksum] varchar(100),
            [state] varchar(MAX),
            exec_time datetime,
            error varchar(MAX),
            primary key (project,channel,[version],checksum)
            );
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