@Library('jenkins-sharedlib@master')

import sharedlib.JenkinsfileUtil
def utils = new JenkinsfileUtil(steps,this,'daily')
def project="SHCL"
def recipients="APSHPRO@credito.bcp.com.pe"
def REPO_BRANCH =""
def CONFIG_PROPS = null
def SECRET_TYPE = ""

def KEY_ID = ""
def SALT_ID = ""
def KEY_VAULT_URL = ""
def CERTIFICATE_LOCAL_PATH = ""
def LOG4J2_FILE = ""

def KEYVAULTS_MAP = [
   'des': 'https://kveu2appshcld01.vault.azure.net',
   'cer': 'https://kveu2appshcld01.vault.azure.net',
   'pro': 'https://kveu2appshclp01.vault.azure.net'
]

def APPLICATION_USER_ID = "bcp-shcl-apshcloud-${params.ENVIRONMENT}".trim()

def KEYVAULT_ID = [
   'des': 'bcp-shcl-key-vault-app-des',
   'cer': 'bcp-shcl-keyvault-certi',
   'pro': 'bcp-shcl-key-vault-app-pro'
]
def KEYVAULT_USER_ID    = KEYVAULT_ID.get(params.ENVIRONMENT)

try {
    
    node {

        stage("Setup Pipeline") {
            steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
            utils.notifyByMail('START',recipients)
            checkout scm
            env.project="${project}"
            utils.prepare()
            utils.setGradleVersion("GRADLE481_JAVA8")
            
            CERTIFICATE_LOCAL_PATH = "$WORKSPACE/certificates/${params.ENVIRONMENT}/KEYVAULT_CERT_AZURE.credito.bcp.com.pe.pfx"
            sh(script: "unzip $WORKSPACE/util.zip")
            LOG4J2_FILE = "$WORKSPACE/util/log4j2.properties"
            KEY_ID        = params.SECURITY_ID + "-key-" + params.ENVIRONMENT
            SALT_ID       = params.SECURITY_ID+ "-salt-" + params.ENVIRONMENT
            KEY_VAULT_URL = KEYVAULTS_MAP.get(params.ENVIRONMENT)
        }      

        stage("Generate Key & Salt") {
           sh("mkdir -p $WORKSPACE/key_salt")
           sh("java -cp $WORKSPACE/util/bcp-shcl-security-util-1.0.jar com.bcp.shcl.security.applications.SecretManager $WORKSPACE/key_salt")
        }
                
        stage("Index into Azure Keyvault the generated secrets") {

            withCredentials([
                [ $class: 'UsernamePasswordMultiBinding', credentialsId: APPLICATION_USER_ID,usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD'],
                [ $class: 'UsernamePasswordMultiBinding', credentialsId: KEYVAULT_USER_ID,usernameVariable: 'APP_ID',passwordVariable: 'APP_SECRET']      
            ]) {

                def vmArgs = [
                      "-Dvault-url=$KEY_VAULT_URL",
                      "-Dapp-id=$APP_ID",
                      "-Dauth-type=CERTIFICATES",
                      "-Dcert-path=$CERTIFICATE_LOCAL_PATH",
                      "-Dcert-password=$APP_SECRET",
                      "-Dkey-id=${KEY_ID}",
                      "-Dsalt-id=${SALT_ID}",
                      "-Dlog4j.configurationFile=$LOG4J2_FILE"
                   ].join(" ");

               def applicationArgs = [
                    "$WORKSPACE/key_salt/key.file",
                    "$WORKSPACE/key_salt/salt.file"
               ].join(" ")

               sh("java ${vmArgs} -cp $WORKSPACE/util/bcp-shcl-security-util-1.0.jar com.bcp.shcl.security.applications.KeyVaultIndexer $applicationArgs")   
                               
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
