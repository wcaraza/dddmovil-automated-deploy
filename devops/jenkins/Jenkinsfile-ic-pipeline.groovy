@Library('jenkins-sharedlib@master')
import sharedlib.JenkinsfileUtil
def utils = new JenkinsfileUtil(steps,this,'daily')
def repositoryName        = params.PROJECT
def branchNameUser        = params.BRANCH_NAME
def project='SHCL'
def REPO_BRANCH =""

def BUILD_DIRECTORY=""

def recipients="gcumpa@bcp.com.pe"

try {

   node {

      stage('Preparation') {
         steps.step([$class: 'WsCleanup', cleanWhenFailure: false])
         utils.notifyByMail('START',recipients)
         checkout scm
         env.project="${project}"
         utils.prepare()
         utils.setGradleVersion("GRADLE481_JAVA8")

            if( branchNameUser.equals("") ) {
                REPO_BRANCH_DEVELOP = "develop"
            } else {
                REPO_BRANCH_DEVELOP = "${branchNameUser}"
            }
            echo "current branch ===>> ${REPO_BRANCH_DEVELOP}"

            def BROWSE_URL_GRADLE_PROPERTIES    = "https://bitbucket.lima.bcp.com.pe/projects/SHCL/repos/${repositoryName}/raw/gradle.properties?at=refs%2Fheads%2F${REPO_BRANCH_DEVELOP}"

            withCredentials([
                [ $class: 'UsernamePasswordMultiBinding', credentialsId:  "${utils.currentCredentialsId}",usernameVariable: 'GIT_USERNAME',passwordVariable: 'GIT_PASSWORD']
            ]){
                sh(script: "curl -o gradle.properties -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BROWSE_URL_GRADLE_PROPERTIES}'")
                sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'")
                VERSION_REPO=sh(script: "cat gradle.properties | grep ^version= | awk -F= '\$1==\"version\" {print \$2}'",returnStdout: true).replaceAll("-SNAPSHOT","")
            }
          	
          	echo "release/${VERSION_REPO}"



            def BRANCHES = [
                "des": "${REPO_BRANCH_DEVELOP}",
              	"cer": "release/${VERSION_REPO}",
                "pro": "master"
            ]
          
          	REPO_BRANCH   = "refs/heads/" + BRANCHES.get(environment)


         
      }
      
      stage("Download Repository") {
  
        def BITBUCKET_TARBALL = "https://bitbucket.lima.bcp.com.pe/rest/api/latest/projects/SHCL/repos/${repositoryName}/archive?at=$REPO_BRANCH&format=tar.gz"

          withCredentials([
                [
                  $class: 'UsernamePasswordMultiBinding', 
                  credentialsId:  "${utils.currentCredentialsId}", 
                  usernameVariable: 'GIT_USERNAME', 
                  passwordVariable: 'GIT_PASSWORD'
               ]
          ]) {
              sh(script: "curl -o spark-project.tar.gz -u ${GIT_USERNAME}:${GIT_PASSWORD} -k -X GET '${BITBUCKET_TARBALL}'")
              sh(script:  "mkdir $WORKSPACE/shcl-deploy && mv devops $WORKSPACE/shcl-deploy && tar -xvf spark-project.tar.gz && rm spark-project.tar.gz")
          }
      }

      stage('Build & U.Test') {
        utils.buildGradle()
      }

      stage('QA Analisys') {
         //utils.executeSonarWithGradle()
      }

      stage('Results') {
         utils.saveResultGradle('jar')
      }

      stage('Upload Artifact') {
         utils.deployArtifactWithGradle()
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
