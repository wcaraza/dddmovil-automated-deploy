@Library('jenkins-sharedlib@master')

import sharedlib.JenkinsfileUtil
def utils = new JenkinsfileUtil(steps,this,'daily')
def notifyRecipients="APSHPRO@credito.bcp.com.pe"

def branchNameUser        = params.BRANCH_NAME
def environment           = params.ENVIRONMENT
def uploadResourceManager = params.UPLOAD_RESOURCE_MANAGER
def indexDSEFSFiles       = params.INDEX_DSE_FS_FILES
def loadID                = params.LOAD_ID
def repositoryName        = params.PROJECT
def channel               = params.CHANNEL.toLowerCase()
def ARTIFACT_NAME         		= ""
def ARTIFACT_VERSION      		= ""
def ARTIFACT_FULL_NAME    		= ""
def DEPENDENCY_LOCAL_DIRECTORY 	= ""
def LOADED_APPLICATION 			= null
def REPO_BRANCH 				= ""
def VERSION_REPO 				= ""
def VERSION_ORIGINAL			= ""

// USUARIO QUE SE CONECTA A LOS SERVIDORES SPARK PARA HACER CAMBIOS A NIVEL DE ESTRUCTURA DE CARPETAS Y COPIAR DE ARCHIVOS.
def SPARK_SERVER_USER_ID        = "bcp-shcl-apshcloud-${params.ENVIRONMENT}".trim() 

// SUPER USUARIO RESPONSABLE DE EJECUTAR LOS SCRIPTS EN CASSANDRA - AGILE OPS PARA CERTI Y PRODUCCION
//def CASSANDRA_AO_USER_ID    = "bcp-shcl-cassandra-cloud-ao-${params.ENVIRONMENT}".trim()
def CASSANDRA_AO_USER_ID    = "bcp-shcl-ldap-cloud-${environment}".trim()

// USUARIO LDAP QUE SE CONECTA A CASSANDRA Y LANZA LA APLICACIÓN SPARK - USUARIO DE APLICACIÓN
def SPARK_AP_USER_ID    = "bcp-${channel}-ldap-cloud-${environment}".trim()

//ID EN EL CREDENTIAL MANAGER PARA CONECTARSE AL KEYVAULT
def KEY_VAULT_CREDENTIALS = [
   'des': 'bcp-shcl-key-vault-app-des',
   'cer': 'bcp-shcl-keyvault-certi',
   'pro': 'bcp-shcl-key-vault-app-pro'
]
def KEY_VAULT_CREDENTIALS_ID    = KEY_VAULT_CREDENTIALS.get(environment)

//ARTIFACTORY
def ARTIFACTORY = [
    "des": "SHCL.Snapshot",
    "cer": "SHCL-CERT",
    "pro": "SHCL.Release"
]
def ARTIFACTORY_ID              = ARTIFACTORY.get(environment)

try {
    node {
        stage("Setup Pipeline") {
            steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
            utils.notifyByMail('START',notifyRecipients)
            checkout scm
            env.project="SHCL"
            utils.prepare()
            utils.setGradleVersion("GRADLE481_JAVA8")

            if( branchNameUser.equals("") ) {
                REPO_BRANCH_DEVELOP = "develop"
            } else {
                REPO_BRANCH_DEVELOP = "${branchNameUser}"
            }
            echo "current development branch ===>> ${REPO_BRANCH_DEVELOP}"
            
            def BROWSE_URL_GRADLE_PROPERTIES    = "https://bitbucket.lima.bcp.com.pe/projects/SHCL/repos/${repositoryName}/raw/gradle.properties?at=refs%2Fheads%2F${REPO_BRANCH_DEVELOP}".replace("\n","").replace("\r","")

            withCredentials([
                [ $class: 'UsernamePasswordMultiBinding', credentialsId:  "${utils.currentCredentialsId}",usernameVariable: 'GIT_USERNAME',passwordVariable: 'GIT_PASSWORD']
            ]){
                sh(script: "curl -o gradle.properties -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BROWSE_URL_GRADLE_PROPERTIES}'")
                sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'")
                VERSION_ORIGINAL=sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'",returnStdout: true)
            }
          	
          	def BRANCHES_REPOSITORY = [
                "des": "${REPO_BRANCH_DEVELOP}",
              	"cer": "${REPO_BRANCH_DEVELOP}",
                "pro": "master"
            ]
          	
            def VERSION_REPOSITORY = [
                "des": "${VERSION_ORIGINAL}",
              	"cer": "${VERSION_ORIGINAL}".replaceAll("-SNAPSHOT",""),
                "pro": "${VERSION_ORIGINAL}".replaceAll("-SNAPSHOT","")
            ]
          	VERSION_REPO =  VERSION_REPOSITORY.get(environment)
          
          	REPO_BRANCH   = "refs/heads/" + BRANCHES_REPOSITORY.get(environment)
			
          	echo "VERSION_ORIGINAL	: ${VERSION_ORIGINAL}"
          	echo "VERSION_REPO		: ${VERSION_REPO}"
          	echo "REPO_BRANCH		: ${REPO_BRANCH}"

        }
        
        stage("Download Repository") {
            def BITBUCKET_TARBALL = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/archive?at=${REPO_BRANCH}&format=tar.gz".replace("\n","").replace("\r","")
            withCredentials([
                [ $class: 'UsernamePasswordMultiBinding', credentialsId:"${utils.currentCredentialsId}",usernameVariable:'GIT_USERNAME',  passwordVariable: 'GIT_PASSWORD' ]
            ]) {
                sh(script: "curl -o spark-project.tar.gz -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BITBUCKET_TARBALL}'")
                sh(script: "mkdir $WORKSPACE/shcl-deploy && mv devops $WORKSPACE/shcl-deploy && tar -xvf spark-project.tar.gz && rm spark-project.tar.gz")
            }
        }

        stage("Download current Artifact Version") {
           	//CA
            PATH_ARTIFACTORY           = sh(script: "head -n 1 $WORKSPACE/gradle.properties | cut -d'.' -f 4",returnStdout: true).trim()
            //CA
            def ARTIFACTORY_URL = "http://10.79.24.33:8081/artifactory/${ARTIFACTORY_ID}/com/bcp/shcl/${PATH_ARTIFACTORY}/${repositoryName}".replace("\n","").replace("\r","")
            
            sh ("curl -D- -k -X GET '$ARTIFACTORY_URL/maven-metadata.xml' --output maven-metadata.xml")
            
            def BASE_METADATA =  readFile("$WORKSPACE/maven-metadata.xml")
            
            //ARTIFACT_VERSION = sh(script: "grep -oPm1 \"(?<=<version>)[^<]+\" <<< \"$BASE_METADATA\"",returnStdout: true).replaceAll("\"","").replace("\n","").replace("\r","")
            ARTIFACT_VERSION = "${VERSION_REPO}".replaceAll("\"","").replace("\n","").replace("\r","")

            ARTIFACT_NAME = "${repositoryName}-${ARTIFACT_VERSION}.jar"

            def METADATA_URL = "$ARTIFACTORY_URL/$ARTIFACT_VERSION/maven-metadata.xml"
            
            sh("curl -D- -k -X GET '$METADATA_URL' --output maven-metadata-1.xml")

            def INTERNAL_METADATA =  readFile("$WORKSPACE/maven-metadata-1.xml")
            def JAR_FILE_URL = ""
            println(INTERNAL_METADATA)
           if( !INTERNAL_METADATA.contains("errors") ) {
                def ARTIFACTORY_VERSION = sh(script: "grep -oPm1 \"(?<=<value>)[^<]+\" <<< \"$INTERNAL_METADATA\"",returnStdout: true).replaceAll("\"","").replace("\n","").replace("\r","") 
                def BASE_ELEMENT_URL = "http://10.79.24.33:8081/artifactory/${ARTIFACTORY_ID}/com/bcp/shcl/${PATH_ARTIFACTORY}/${repositoryName}/$ARTIFACT_VERSION/${repositoryName}-$ARTIFACTORY_VERSION"         
                JAR_FILE_URL = "${BASE_ELEMENT_URL}.jar"
            } else {

                JAR_FILE_URL = "http://10.79.24.33:8081/artifactory/${ARTIFACTORY_ID}/com/bcp/shcl/${PATH_ARTIFACTORY}/${repositoryName}/$ARTIFACT_VERSION/$ARTIFACT_NAME".replace("\n","").replace("\r","")
            }

            sh("curl -D- -k -GET $JAR_FILE_URL --output $ARTIFACT_NAME")

        }

        stage("Fetch dependencies") {

           sh("chmod +x $WORKSPACE/gradlew.sh")
           sh("$WORKSPACE/gradlew.sh copyDependencies")
        }

        stage("Preparing deployment") {
     		
          	// TODO: Talk to devsecops how this is an stupid idea
            if( params.ENVIRONMENT == 'des') {
              DEPENDENCY_LOCAL_DIRECTORY = "$WORKSPACE/build/${ARTIFACT_VERSION}"
            } else if (params.ENVIRONMENT == 'cer') {
              DEPENDENCY_LOCAL_DIRECTORY = "$WORKSPACE/build/${ARTIFACT_VERSION}-SNAPSHOT" }
            else {
                DEPENDENCY_LOCAL_DIRECTORY = "$WORKSPACE/build/$ARTIFACT_VERSION".replaceAll("-SNAPSHOT","")
            }
                     
            sh("find $WORKSPACE/lib -type f -name \"*.jar\" -exec cp -t ${DEPENDENCY_LOCAL_DIRECTORY}/dependencies {} +")
            sh("zip -r -j $WORKSPACE/dependencies.zip ${DEPENDENCY_LOCAL_DIRECTORY}/dependencies")
            if( indexDSEFSFiles ) {
                sh("zip -r $WORKSPACE/dsefs_files.zip $WORKSPACE/dse_fs")
            }
        }

        stage("Run Ansible Deploy tasks") {
            
            def EXTRA_CLASSPATH = sh(script: 'array=($(ls ' + DEPENDENCY_LOCAL_DIRECTORY + '/dependencies));echo $( IFS=$\',\'; echo \"${array[*]}\" );unset IFS',returnStdout: true).replaceAll("\"","").replace("\n","").replace("\r","").split(",")

            withCredentials([
                usernamePassword(credentialsId: CASSANDRA_AO_USER_ID     , usernameVariable: 'SPARK_AO_USER_NAME'     , passwordVariable: 'SPARK_AO_USER_PASS'),
                usernamePassword(credentialsId: SPARK_AP_USER_ID         , usernameVariable: 'SPARK_AP_USER_NAME'     , passwordVariable: 'SPARK_AP_USER_PASS'),
                usernamePassword(credentialsId: SPARK_SERVER_USER_ID     , usernameVariable: 'SPARK_SERVER_USER_NAME' , passwordVariable: 'SPARK_SERVER_USER_PASS'),
                usernamePassword(credentialsId: KEY_VAULT_CREDENTIALS_ID , usernameVariable: 'KEY_VAULT_NAME'          , passwordVariable: 'KEY_VAULT_PASS')
            ]) {
                
                def FORMATTED_PARAMS = "${repositoryName}-${channel}"

                ansiblePlaybook (
                    playbook: "ansible/dse-spark-submit/dse-spark-submit.yml",
                    inventory: "$WORKSPACE/ansible/hosts",
                    extraVars: [
                        //CREDENCIALES
                        ansible_user            : "${SPARK_SERVER_USER_NAME}",//ANSIBLE_SSH_USER
                        ansible_ssh_pass        : "${SPARK_SERVER_USER_PASS}",
                        SPARK_AO_USER_NAME      : SPARK_AO_USER_NAME,//CASSANDRA_USERNAME
                        SPARK_AO_USER_PASS      : SPARK_AO_USER_PASS,
                        SPARK_AP_USER_NAME      : SPARK_AP_USER_NAME,//APSH_USERNAME
                        SPARK_AP_USER_PASS      : SPARK_AP_USER_PASS,
                        KEYVAULT_NAME           : KEY_VAULT_NAME,//KEYVAULT_APP_ID
                        KEYVAULT_PASS           : KEY_VAULT_PASS,
                        //PARÁMETROS
                        RESOURCE_MANAGER        : uploadResourceManager,
                        INDEX_DSE_FS_FILES      : indexDSEFSFiles,
                        SPARK_APP_FILE_ID       : loadID,
                        ENVIRONMENT             : environment,
                        PROYECT                 : channel,
                        APPLICATION_NAME        : repositoryName,
                        APPLICATION_VERSION     : ARTIFACT_VERSION,
                        //DIRECTORIOS
                        DEPLOY_BASE_PATH                : "/opt",
                       	SPARK_APP_FILE_PATH             : "/MASTER/scripts/${channel}",
                        DSE_RESOURCE_MANAGER_LOCAL_PATH : "$WORKSPACE/dse-modules/dse-resource-manager/",
                        APPLICATION_BASE_DIRECTORY      : "$WORKSPACE",
                        //OTROS PARÁMETROS
                        extras                  : "-vvvv",
                        ansible_connection      : "ssh",
                        spark_worker_inventory  : "spark-hosts-${environment}",
                        EXTRA_CLASSPATH         : EXTRA_CLASSPATH.join(","),
                        EXTRA_PARAMS            : FORMATTED_PARAMS,
                        INMEDIATE_LAUNCH        : params.LAUNCH,
                        SUPERVISED              : true
                    ]
                )
            }
        }

        stage("Post Execution") {
            utils.executePostExecutionTasks()
            utils.notifyByMail('SUCCESS',notifyRecipients)   
        }
    }

} catch(Exception e) {
   node {
      utils.executeOnErrorExecutionTasks()
      utils.notifyByMail('FAIL',notifyRecipients)
	  throw e
   }
}
