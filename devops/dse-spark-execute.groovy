@Library('jenkins-sharedlib@master')

import sharedlib.JenkinsfileUtil
def utils 		= new JenkinsfileUtil(steps,this,'daily')
def recipients	="APSHPRO@credito.bcp.com.pe"
def channel 	= params.CHANNEL.toLowerCase()
def script		= params.SCRIPT_NAME
def environment = params.ENVIRONMENT

try{
   node {
      stage("Setup Pipeline") {
         steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
         utils.notifyByMail('START',recipients)
         checkout scm
         env.project="${channel}"
         utils.prepare()
         utils.setGradleVersion("GRADLE481_JAVA8")
      }
      
      stage("Run Ansible execute task"){
         withCredentials([
           usernamePassword(credentialsId: "bcp-shcl-apshcloud-${environment}".trim(), 
                            usernameVariable: 'SSH_USERNAME', 
                            passwordVariable: 'SSH_PASSWORD')
         ]){
            ansiblePlaybook (
               playbook: "ansible/dse-spark-execute/dse-spark-execute.yml",
               inventory: "$WORKSPACE/ansible/hosts",
               extraVars: [
                  extras              : "-vvvv",
                  ansible_connection  : "ssh",
                  ansible_user        : "${SSH_USERNAME}",
                  ansible_ssh_pass    : "${SSH_PASSWORD}",
                  script_path         : "/MASTER/scripts/${channel}/${script}.sh"
               ]
            )
         }
      }
      stage('Post Execution') {
         utils.executePostExecutionTasks()
         utils.notifyByMail('SUCCESS',recipients)
      }
   }
}
catch(Exception e) {
   node{
      utils.executeOnErrorExecutionTasks()
      utils.notifyByMail('FAIL',recipients)
    throw e
   }
}
