@Library('jenkins-sharedlib@master')
import sharedlib.JenkinsfileUtil
def utils = new JenkinsfileUtil(steps,this)
/* Project settings */
def project="SHCL"
/* Mail configuration*/
// If recipients is null the mail is sent to the person who start the job
// The mails should be separated by commas(',')
def recipients=""
def deploymentEnvironment="prod"
def artifactoryUrl="http://paplnwind07:80/artifactory"
try {
   node { 
      stage('Preparation') {
         utils.notifyByMail('START',recipients)
         checkout scm
         utils.prepare()
         //Setup parameters
         env.project="${project}"
      }

      stage('Promote Release') {
     	   appVersion= utils.getApplicationVersionFreeStyle()
         utils.promoteReleaseFreeStyle(params.RELEASE_TAG_NAME,params.FORCE_RELEASE)
      }
      
      stage('Save Results') {
         utils.saveResultFreeStyle('tar')
      }
      
      stage("Deploy to" +deploymentEnvironment){
         // Your Deploy method goes here
      }
	    
      stage('Post Execution') {
        utils.executePostExecutionTasks()
        utils.notifyByMail('SUCCESS',recipients)
      }
      
   }
} catch(Exception e) {
   node{
      utils.executeOnErrorExecutionTasks()
      utils.notifyByMail('FAIL',recipients)
    throw e
   }
}