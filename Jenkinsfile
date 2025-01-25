// Syntax check with this command line
// curl -k -X POST -F "jenkinsfile=<Jenkinsfile" https://ci.rssw.eu/pipeline-model-converter/validate

pipeline {
  agent { label 'Linux-Office03' }
  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }
  stages {
    stage('Checkout') {
      steps {
        checkout([$class: 'GitSCM', branches: scm.branches, extensions: scm.extensions + [[$class: 'CleanCheckout']], userRemoteConfigs: scm.userRemoteConfigs])
      }
    }

    stage('Dependencies') {
      steps {
        script {
          def ablsVersion = "1.20.0-SNAPSHOT"
          withEnv(["MVN_HOME=${tool name: 'Maven 3', type: 'hudson.tasks.Maven$MavenInstallation'}"]) {
            sh "$MVN_HOME/bin/mvn -U -B -ntp dependency:get -Dartifact=eu.rssw.proparse:abl-lsp-bootstrap:${ablsVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/proparse/abl-lsp-bootstrap/${ablsVersion}/abl-lsp-bootstrap-${ablsVersion}.jar resources/abl-lsda.jar"
            // Curl -L in order to follow redirects
            sh "curl -s -L -o resources/jre-windows.zip https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jre_x64_windows_hotspot_17.0.13_11.zip"
            sh "curl -s -L -o resources/jre-linux.tar.gz https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jre_x64_linux_hotspot_17.0.13_11.tar.gz"
          }
        }
      }
    }

    stage('Build') { 
      agent {
        docker {
          image 'node:20'
          args "-v ${tool name: 'SQScanner4', type: 'hudson.plugins.sonar.SonarRunnerInstallation'}:/scanner -e HOME=."
          reuseNode true
        }
      }
      steps {
        script {
          withSonarQubeEnv('RSSW2') {
            sh 'node --version && npm install webpack && npm run lint && cp node_modules/abl-tmlanguage/abl.tmLanguage.json resources/abl.tmLanguage.json && npm run grammar-version'
            if ("develop" == env.BRANCH_NAME) {
              sh 'npx @vscode/vsce package --pre-release'
              sh 'unzip -q resources/jre-windows.zip && mv jdk-17.0.13+11-jre jre'
              sh 'npx @vscode/vsce package --pre-release --target win32-x64'
              sh 'rm -rf jre/ && tar xfz resources/jre-linux.tar.gz && mv jdk-17.0.13+11-jre jre'
              sh 'npx @vscode/vsce package --pre-release --target linux-x64'
            } else {
              sh 'npx @vscode/vsce package'
              sh 'unzip -q resources/jre-windows.zip && mv jdk-17.0.13+11-jre jre'
              sh 'npx @vscode/vsce package --target win32-x64'
              sh 'rm -rf jre/ && tar xfz resources/jre-linux.tar.gz && mv jdk-17.0.13+11-jre jre'
              sh 'npx @vscode/vsce package --target linux-x64'
            }
          }
          archiveArtifacts artifacts: '*.vsix'
          if ("develop" == env.BRANCH_NAME) {
            withCredentials([string(credentialsId: 'VSCODE_PAT', variable: 'VSCE_PAT')]) {
              sh "npx @vscode/vsce publish --pre-release --packagePath *.vsix"
            }
          } else if ("main" == env.BRANCH_NAME) {
            withCredentials([string(credentialsId: 'VSCODE_PAT', variable: 'VSCE_PAT')]) {
              sh "npx @vscode/vsce publish --packagePath *.vsix"
            }
          } else {
            sh "echo Artifacts not published!"
          }
        }
      }
    }           
  }

  post {
    failure {
      script {
        mail body: "Check console output at ${BUILD_URL}/console", to: "g.querret@riverside-software.fr", subject: "vscode-abl build failure in Jenkins - Branch ${BRANCH_NAME}"
      }
    }
    fixed {
      script {
        mail body: "Console output at ${BUILD_URL}/console", to: "g.querret@riverside-software.fr", subject: "vscode-abl build is back to normal - Branch ${BRANCH_NAME}"
      }
    }
  }
}
