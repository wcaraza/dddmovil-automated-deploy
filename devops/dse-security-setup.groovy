@Library('jenkins-sharedlib@master')

import sharedlib.JenkinsfileUtil
def utils               = new JenkinsfileUtil(steps,this,'daily')
def recipients          ="APSHPRO@credito.bcp.com.pe"
def repositoryName      = params.PROJECT
def branchNameUser      = params.BRANCH_NAME
def environment         = params.ENVIRONMENT
def REPO_BRANCH 		= ""
def REPO_BRANCH_DEVELOP = ""
def VERSION_REPO		= ""
def CONFIG_PROPS        = null
def KEY_ID              = ""
def SALT_ID             = ""
def LOG4J2_FILE         = ""
def DEPLOY_HOSTS 		= ""

// USUARIO QUE SE CONECTA A LOS SERVIDORES SPARK PARA HACER CAMBIOS A NIVEL DE ESTRUCTURA DE CARPETAS Y COPIAR DE ARCHIVOS.
def ANSIBLE_USER_ID    = ""

//URL DE KEY VAULT ALEXANDRIA
def KEY_VAULT= [
   'des': 'https://kveu2appshcld01.vault.azure.net',
   'cer': 'https://kveu2appshcld01.vault.azure.net',
   'pro': 'https://kveu2appshclp01.vault.azure.net'
]
def KEY_VAULT_URL   = KEY_VAULT.get(environment)

// CREDENCIAL ID DEL KEY VAULT DE ALEXANDRIA
def KEY_VAULT_CREDENTIALS = [
   'des': 'bcp-shcl-key-vault-app-des',
   'cer': 'bcp-shcl-keyvault-certi',
   'pro': 'bcp-shcl-key-vault-app-pro'
]
def KEY_VAULT_CREDENTIALS_ID    = KEY_VAULT_CREDENTIALS.get(environment)

def HOST_INVENTORY       	    = "sql-connector-${environment}"
def CERTIFICATE_LOCAL_PATH      = ""
try {
    
    node {

        stage("Setup Pipeline") {
            steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
            utils.notifyByMail('START',recipients)
            checkout scm
            env.project="SHCL"
            utils.prepare()
            utils.setGradleVersion("GRADLE481_JAVA8")
          
            DEPLOY_HOSTS = (params.DEPLOY_HOSTS.equals("") || params.DEPLOY_HOSTS == null) ? "spark" : params.DEPLOY_HOSTS;

            if( branchNameUser.equals("") ) {
                REPO_BRANCH_DEVELOP = "develop"
            } else {
                REPO_BRANCH_DEVELOP = "${branchNameUser}"
            }
            echo "current branch ===>> ${REPO_BRANCH_DEVELOP}"

            def BROWSE_URL_GRADLE_PROPERTIES    = "https://bitbucket.lima.bcp.com.pe/projects/SHCL/repos/${repositoryName}/raw/gradle.properties?at=refs%2Fheads%2F${REPO_BRANCH_DEVELOP}".replace("\n","").replace("\r","")

            withCredentials([
                usernamePassword(credentialsId:  "${utils.currentCredentialsId}",usernameVariable: 'GIT_USERNAME',passwordVariable: 'GIT_PASSWORD')
            ]){
                sh(script: "curl -o gradle.properties -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BROWSE_URL_GRADLE_PROPERTIES}'")
                sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'")
                VERSION_REPO=sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'",returnStdout: true).replaceAll("\"","").replace("\n","").replace("\r","")
            }
          	
          	echo "RAMA CERTI: release/${VERSION_REPO}"

            def BRANCHES = [
                "des": "${REPO_BRANCH_DEVELOP}",
                "cer": "${REPO_BRANCH_DEVELOP}",
                "pro": "master"
            ]
          
          REPO_BRANCH   = "refs/heads/${BRANCHES.get(environment)}".replace("\n","").replace("\r","")
			echo "RAMA FINAL ${REPO_BRANCH}"
          
            CERTIFICATE_LOCAL_PATH      = "$WORKSPACE/certificates/${environment}/KEYVAULT_CERT_AZURE.credito.bcp.com.pe.pfx".replace("\n","").replace("\r","")

        }

        stage("Setup repository") {
          
          def BITBUCKET_TARBALL = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/archive?at=${REPO_BRANCH}&format=tar.gz".replaceAll("\"","").replace("\n","").replace("\r","")

          withCredentials([
            usernamePassword(credentialsId: "${utils.currentCredentialsId}", usernameVariable: 'GIT_USERNAME', passwordVariable: 'GIT_PASSWORD')
          ]) {
            
             sh(script: "curl -o spark-project.tar.gz -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BITBUCKET_TARBALL}'")
             
             sh(script: "mkdir $WORKSPACE/shcl-deploy && mv devops $WORKSPACE/shcl-deploy && tar -xvf spark-project.tar.gz && rm spark-project.tar.gz")
             
             sh(script: "unzip $WORKSPACE/util.zip")
             
             LOG4J2_FILE = "$WORKSPACE/util/log4j2.properties"
             
             CONFIG_PROPS  = readJSON file : "$WORKSPACE/devops/deploy-settings.json"
             
             println CONFIG_PROPS;

             def SECURITY_OPTS   = CONFIG_PROPS.get("security-setup");
             def DEPLOYMENT_OPTS = CONFIG_PROPS.get("deployment")
             
             println "SECURITY_OPTS   "+SECURITY_OPTS;
             KEY_ID        = SECURITY_OPTS["key-id"]  + "-" + environment
             SALT_ID       = SECURITY_OPTS["salt-id"] + "-" + environment

          }
        }       

        stage("Encrypt Configurations") {
            
            def credentialsBinding = CONFIG_PROPS["credentialsbinding"]
            def cryptoFields       = CONFIG_PROPS["crypto-fields"]
            def credentialsBindingEvaluated = []
           
            for (item in credentialsBinding) {
                def baseCredId   = item['credential-id'] 
                def credentialId = "${baseCredId}${environment}"
                credentialsBindingEvaluated << [
                    $class: 'UsernamePasswordMultiBinding', 
                    credentialsId:  credentialId,
                    usernameVariable: item['userNameVariable'], 
                    passwordVariable: item['passwordVariable']
                ]
            }

            credentialsBindingEvaluated << [
                $class: 'UsernamePasswordMultiBinding', 
                credentialsId: KEY_VAULT_CREDENTIALS_ID,
                usernameVariable: 'APP_ID',
                passwordVariable: 'APP_SECRET'
            ]

			withCredentials(credentialsBindingEvaluated) {
                def cryptoArgs = []
                def jvmArgs    = []
                      
                cryptoArgs = [ "$KEY_ID","$SALT_ID","$WORKSPACE/config/${environment}/environment.conf" ]
                jvmArgs = [
                     "-Dauth-type=CERTIFICATES",
                     "-Dvault-url=$KEY_VAULT_URL",
                     "-Dapp-id=$APP_ID",
                     "-Dcert-path=$CERTIFICATE_LOCAL_PATH",
                     "-Dcert-password=$APP_SECRET",
                     "-Dlog4j.configurationFile=$LOG4J2_FILE",
                     "-Dcrypto-type=key-ids"
                ];

                
                cryptoFields.each {
                  def cryptoField = it["config"]
                  def cryptoValue = it["variable"]
                  def credentialEval = env.getProperty(cryptoValue)
                  cryptoArgs << "$cryptoField:$credentialEval"
                }

                def arguments = cryptoArgs.join(" ")
                def sysProps = jvmArgs.join(" ")
                sh("java $sysProps -cp $WORKSPACE/util/bcp-shcl-security-util-1.0.jar com.bcp.shcl.security.applications.ConfigUtil $arguments")

			}
        }
        
        stage("Push Changes into repository") {
            
            withCredentials([
                 usernamePassword(credentialsId: utils.currentCredentialsId, usernameVariable: 'GIT_USERNAME', passwordVariable: 'GIT_PASSWORD')
            ]) {

                def COMMIT_ENDPOINT    = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/browse/config/${environment}/environment.conf".replace("\n","").replace("\r","")
                def BROWSE_URL         = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/commits?until=${REPO_BRANCH}&path=config/${environment}/environment.conf".replace("\n","").replace("\r","")
                    
                def CONFIG_REPO_PATH  = "config/${environment}/environment.conf"
                def CONFIG_PATH       = "$WORKSPACE/config/${environment}/environment.conf".replace("\n","").replace("\r","")
                def CONFIG_CONTENT    = sh(script: "cat $CONFIG_PATH", returnStdout: true)
                def GET_FILE_COMMIT   = "curl -k -u $GIT_USERNAME:$GIT_PASSWORD '$BROWSE_URL' | jq '.values|.[0]|.id' "
                def COMMIT_ID         = sh(script: GET_FILE_COMMIT, returnStdout: true).replaceAll("\"","").replace("\n","").replace("\r","")

                def PUSH_FILE_CMD   = [
                    "curl -k -X PUT -u $GIT_USERNAME:$GIT_PASSWORD",
                    "-F content=@$CONFIG_PATH",
                    "-F 'message=dse-security-setup encrypted securely your config using key: $KEY_ID and salt: $SALT_ID on keyvault $KEY_VAULT_URL'",
                    "-F 'sourceCommitId=$COMMIT_ID'",
                    "-F 'branch=$REPO_BRANCH'",
                    "'$COMMIT_ENDPOINT'"
                ].join(" ")

                def API_RESPONSE = sh(script: PUSH_FILE_CMD, returnStdout: true)
                print "GOT COMMIT API RESPONSE $API_RESPONSE"
            }
        }
        
        stage("Transport keyvault certificates") {
          
          
          switch(DEPLOY_HOSTS) {
              case 'docker':
                  ANSIBLE_USER_ID = "bcp-shcl-apsh${params.ENVIRONMENT}"
                  break;
              default:
                  ANSIBLE_USER_ID = "bcp-shcl-apshcloud-${params.ENVIRONMENT}".trim()
            	  break;
          }

            withCredentials([
                usernamePassword(credentialsId: ANSIBLE_USER_ID, usernameVariable: 'SPARK_SERVER_USER_NAME', passwordVariable: 'SPARK_SERVER_USER_PASS'),
                file(credentialsId: "bcp-shcl-spark-client-cert-jks-${params.ENVIRONMENT}", variable: 'SPARK_CLIENT_JKS_CERT'),
                file(credentialsId: "bcp-shcl-spark-client-key-jks-${params.ENVIRONMENT}", variable: 'SPARK_CLIENT_JKS_KEY')
            ]) {
               ansiblePlaybook(
                    playbook: "$WORKSPACE/ansible/dse-security-setup/site.yml",
                    inventory: "$WORKSPACE/ansible/hosts",
                    extraVars: [
                        extras                  : "-vvvv",
                        ansible_connection      : "ssh",
                        ansible_user            : "${SPARK_SERVER_USER_NAME}",
                        ansible_ssh_pass        : "${SPARK_SERVER_USER_PASS}",
                        spark_worker_inventory  : "${DEPLOY_HOSTS}-hosts-${environment}",
                        APPLICATION_ID          : repositoryName,
                        DEPLOY_BASE_PATH        : "/opt",
                        CERTIFICATE_LOCAL_PATH  : CERTIFICATE_LOCAL_PATH,
                        SPARK_CLIENT_JKS_CERT   : SPARK_CLIENT_JKS_CERT, 
                        SPARK_CLIENT_JKS_KEY    : SPARK_CLIENT_JKS_KEY
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
      utils.notifyByMail('FAIL',recipients)
	  throw e
   }
}
