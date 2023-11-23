// Syntax check with this command line
// curl -k -X POST -F "jenkinsfile=<Jenkinsfile" https://ci.rssw.eu/pipeline-model-converter/validate

pipeline {
  agent { label 'Linux-Office' }
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
          def rulesVersion = "2.24.0"
          def cablVersion = "2.24.0"
          def ablsVersion = "1.12.0"
          withEnv(["MVN_HOME=${tool name: 'Maven 3', type: 'hudson.tasks.Maven$MavenInstallation'}"]) {
            sh "$MVN_HOME/bin/mvn -B -ntp dependency:get -Dartifact=eu.rssw.sonar.openedge:sonar-openedge-plugin:${cablVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/sonar/openedge/sonar-openedge-plugin/${cablVersion}/sonar-openedge-plugin-${cablVersion}.jar resources/sonar-openedge-plugin.jar"
            sh "$MVN_HOME/bin/mvn -B -ntp dependency:get -Dartifact=eu.rssw.sonar.openedge:riverside-rules-plugin:${rulesVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/sonar/openedge/riverside-rules-plugin/${rulesVersion}/riverside-rules-plugin-${rulesVersion}.jar resources/riverside-rules-plugin.jar"
            sh "$MVN_HOME/bin/mvn -B -ntp dependency:get -Dartifact=eu.rssw.sonar.openedge:progress-rules-plugin:${rulesVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/sonar/openedge/progress-rules-plugin/${rulesVersion}/progress-rules-plugin-${rulesVersion}.jar resources/progress-rules-plugin.jar"
            sh "$MVN_HOME/bin/mvn -B -ntp dependency:get -Dartifact=eu.rssw.proparse:abl-lsp-bootstrap:${ablsVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/proparse/abl-lsp-bootstrap/${ablsVersion}/abl-lsp-bootstrap-${ablsVersion}.jar resources/abl-lsp.jar"
            sh "$MVN_HOME/bin/mvn -B -ntp dependency:get -Dartifact=eu.rssw.proparse:abl-dap-bootstrap:${ablsVersion} -Dtransitive=false && cp $HOME/.m2/repository/eu/rssw/proparse/abl-dap-bootstrap/${ablsVersion}/abl-dap-bootstrap-${ablsVersion}.jar resources/abl-dap.jar"
          }
        }
      }
    }

    stage('Build') { 
      agent {
        docker {
          image 'node:16'
          args "-v ${tool name: 'SQScanner4', type: 'hudson.plugins.sonar.SonarRunnerInstallation'}:/scanner -e HOME=."
          reuseNode true
        }
      }
      steps {
        withSonarQubeEnv('RSSW2') {
          sh 'node --version && npm install vsce && npm install webpack && npm run lint && cp node_modules/abl-tmlanguage/abl.tmLanguage.json resources/abl.tmLanguage.json && node_modules/.bin/vsce package'
        }
        archiveArtifacts artifacts: '*.vsix'
      }
    }

    stage('Build Docker Image') {
      when { branch 'main' }
      steps {
        script {
          docker.withServer('unix:///var/run/docker.sock') {
            sh 'cp *.vsix docker && docker build --no-cache -t docker.rssw.eu/vscode/abl:latest -f docker/Dockerfile docker && docker push docker.rssw.eu/vscode/abl:latest'
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