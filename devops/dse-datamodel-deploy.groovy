@Library('jenkins-sharedlib@master')

import sharedlib.JenkinsfileUtil
def utils				          = new JenkinsfileUtil(steps,this,'daily')
def notifyRecipients	    = "APSHPRO@credito.bcp.com.pe"
def repositoryName        = params.PROJECT
def environment			      = params.ENVIRONMENT
def versionDeploy		      = params.VERSION_NUMBER
def modelType             = params.MODEL_TYPE
def channel               = params.CHANNEL.toLowerCase()
def branchName            = params.BRANCH_NAME
def action                = params.ACTION
def dataModelDeployer     = params.DATAMODEL_DEPLOYER
def REPO_BRANCH 		      = ""
def VERSION_REPO		      = ""
def DB_USER_ID            = ""
def DB_HOST               = ""
def DB_PORT               = ""
def DB_NAME               = ""
def SPARK_SERVER_USER_ID  = ""
def BRANCHES_REPOSITORY   = ""
def SUBSCRIPTION_HOST     = ""
def SUBSCRIPTION_PORT     = ""
def SUBSCRIPTION_DB       = ""

try {
    
    node {
      stage("Setup Pipeline") {
        steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
        utils.notifyByMail('START',notifyRecipients)
        checkout scm
        env.project="${repositoryName}"
        utils.prepare()
            
        // USUARIO QUE SE CONECTA A LOS SERVIDORES SPARK PARA HACER CAMBIOS A NIVEL DE ESTRUCTURA DE CARPETAS Y COPIAR DE ARCHIVOS
        SPARK_SERVER_USER_ID	= "bcp-shcl-apshcloud-${environment}".trim()
        
        // AGILE OPS (CHANNEL)
        if (modelType == "cassandra" && channel == "shcl") {
          CHANNEL_DB_USER_ID = "bcp-shcl-ldap-cloud-${environment}".trim()  
        } else {
          CHANNEL_DB_USER_ID = "bcp-${channel}-${modelType}-${environment}".trim()
        }
        

        // Contact Point servers
        def cassandra_hosts = [
          'des': '10.79.6.85,10.79.6.86,10.79.6.87',
          'cer': '10.79.15.75,10.79.15.76,10.79.15.77',
          'pro': '10.79.24.171,10.79.24.172,10.79.24.173'
        ]

        // Define DB model specific settings
        switch(modelType) {
          case 'sql-azure':
            DB_USER_ID          = "bcp-shcl-sql-azure-${environment}".trim()

            // SECRET FILE DE CANAL
            withCredentials([
              file(credentialsId: "bcp-${channel}-${modelType}-sf-${environment}".trim(), variable: 'FILE')
            ]){
              CONFIG_PROPS           = readJSON file : "$FILE"
              SUBSCRIPTION_HOST  = CONFIG_PROPS.get("host");
              SUBSCRIPTION_PORT  = CONFIG_PROPS.get("port");
              SUBSCRIPTION_DB    = CONFIG_PROPS.get("database");
            }

            // SECRET FILE DE ALX
            withCredentials([
              file(credentialsId: "bcp-shcl-${modelType}-sf-${environment}".trim(), variable: 'FILE')
            ]){
              CONFIG_PROPS        = readJSON file : "$FILE"
              DB_HOST             = CONFIG_PROPS.get("host");
              DB_PORT             = CONFIG_PROPS.get("port");
              DB_NAME             = CONFIG_PROPS.get("database");
            }
            break
          case 'cassandra':
            DB_USER_ID    = "bcp-shcl-ldap-cloud-${environment}".trim()
            DB_HOST       = "${cassandra_hosts.get(environment)}"
            break
          case 'cosmos':
            // SECRET FILE DE CANAL
            withCredentials([
              file(credentialsId: "bcp-${channel}-${modelType}-sf-${environment}".trim(), variable: 'FILE')
            ]){
              CONFIG_PROPS       = readJSON file : "$FILE"
              ENDPOINT_SUBSCRIPTION  = CONFIG_PROPS.get("endpointSubscription");
              MASTER_KEY_SUBSCRIPTION  = CONFIG_PROPS.get("masterKeySubscription");
            }

            // SECRET FILE DE ALX
            withCredentials([
              file(credentialsId: "bcp-shcl-${modelType}-sf-${environment}".trim(), variable: 'FILE')
            ]){
              CONFIG_PROPS        = readJSON file : "$FILE"
              ENDPOINT  = CONFIG_PROPS.get("endpoint");
              MASTER_KEY  = CONFIG_PROPS.get("masterKey");
            }
            break
          default:
            DB_USER_ID  = ""
            DB_HOST     = ""
            break
        }
        assert DB_USER_ID != "": "Invalid DB_USER_ID"
        assert DB_HOST != "": "Invalid DB_HOST"
        
        BRANCHES_REPOSITORY = [
          "des": (branchName) ? branchName : "develop",
          "cer": "develop",
          "pro": "master"
        ]
        
       	echo "EXECUTOR_CHANNEL          ==> bcp-${channel}-${modelType}-ao-${environment}"
        echo "current development branch==> ${BRANCHES_REPOSITORY.get(environment)}"
      }

      stage("Setup repository") {

        def BITBUCKET_TARBALL = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/archive?at=refs/heads/${BRANCHES_REPOSITORY.get(environment)}&format=tar.gz".replace("\n","").replace("\r","")

        withCredentials([
          usernamePassword(credentialsId:  "${utils.currentCredentialsId}",usernameVariable: 'GIT_USERNAME',passwordVariable: 'GIT_PASSWORD')
        ]){
          sh(script: "curl -o models.tar.gz -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BITBUCKET_TARBALL}'")            
          sh(script: "tar -xvf models.tar.gz && rm models.tar.gz")
        }
      }
		
      stage("Run Ansible tasks") {     
        withCredentials([
          usernamePassword(credentialsId: SPARK_SERVER_USER_ID, usernameVariable: 'SPARK_SERVER_USER_NAME', passwordVariable: 'SPARK_SERVER_USER_PASS'),
          usernamePassword(credentialsId: DB_USER_ID, usernameVariable: 'DB_USER_NAME', passwordVariable: 'DB_USER_PASS'),
          usernamePassword(credentialsId: CHANNEL_DB_USER_ID  ,usernameVariable: 'CHANNEL_DB_USER_NAME', passwordVariable: 'CHANNEL_DB_USER_PASS')
        ]){

          ansiblePlaybook(
            playbook: "$WORKSPACE/ansible/dse-datamodel-deploy/site.yml",
            inventory: "$WORKSPACE/ansible/hosts",
            extraVars: [
              extras					                : "-vvvv -o ControlPersist=5m",
              ansible_connection		          : "ssh",
              ansible_user			              : "${SPARK_SERVER_USER_NAME}",
              ansible_ssh_pass		            : "${SPARK_SERVER_USER_PASS}",
              MODEL_TYPE					            : "${modelType}",
              DEPLOY_SCRIPT_INVENTORY         : "spark-hosts-${environment}",
					    DB_HOST		                      : "${DB_HOST}",
              DATAMODEL_DEPLOYER		          : "${dataModelDeployer}",
              DB_USERNAME				              : "${DB_USER_NAME}",
              DB_PASSWORD	              			: "${DB_USER_PASS}",
              DB_USERNAME_SUBSCRIPTION				: "${CHANNEL_DB_USER_NAME}",
              DB_PASSWORD_SUBSCRIPTION				: "${CHANNEL_DB_USER_PASS}",
              DATABASE_SUBSCRIPTION           : "${SUBSCRIPTION_DB}",
              PORT_SUBSCRIPTION               : "${SUBSCRIPTION_PORT}",
              HOSTS_SUBSCRIPTION              : "${SUBSCRIPTION_HOST}",
              DATABASE                        : "${DB_NAME}",
              PORT                            : "${DB_PORT}",
              DB_ENDPOINT                     : "${ENDPOINT}"
              DB_MASTER_KEY                   : "${MASTER_KEY}"
              DB_ENDPOINT_SUBSCRIPTION        : "${ENDPOINT_SUBSCRIPTION}"
              DB_MASTER_KEY_SUBSCRIPTION      : "${MASTER_KEY_SUBSCRIPTION}"
              SCRIPT_VERSION			            : "${versionDeploy}",
              ACTION		                			: "${action}",
              PROJECT			                 		: "${repositoryName}",
              CHANNEL			                		: "${channel}".toUpperCase(),
              ENVIRONMENT			              	: "${environment}",
              DSE_DATA_MODEL_DEPLOYER_LOCAL_PATH	: "$WORKSPACE/dse-modules/dse-datamodel-deploy-${MODEL_TYPE}",
              WORKSPACE_DATAMODEL_DIRECTORY		: "$WORKSPACE/src"
              ]
          )
        }
      }
        
      stage('Post Execution') {
        utils.executePostExecutionTasks()
      }
    }

} catch (Exception e) {
   node {
      steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
      utils.notifyByMail('FAIL',notifyRecipients)
	  throw e
   }
}
