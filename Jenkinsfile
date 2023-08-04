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

    stage('Build') { 
      agent {
        docker {
          image 'node:16'
          args "-v ${tool name: 'SQScanner4', type: 'hudson.plugins.sonar.SonarRunnerInstallation'}:/scanner -e HOME=."
          reuseNode true
        }
      }
      steps {
        copyArtifacts filter: '**/*.jar', fingerprintArtifacts: true, projectName: '/ABLS/develop', selector: lastSuccessful(), target: '.'
        copyArtifacts filter: '**/*.jar', fingerprintArtifacts: true, projectName: '/sonar-openedge/release%252FV2.22', selector: lastSuccessful(), target: '.'
        copyArtifacts filter: '**/*.jar', fingerprintArtifacts: true, projectName: '/sonar-openedge-rules/release%252FV2.22', selector: lastSuccessful(), target: '.'
        copyArtifacts filter: '**/*.jar', fingerprintArtifacts: true, projectName: '/progress-rules/release%252FV2.22', selector: lastSuccessful(), target: '.'
        withSonarQubeEnv('RSSW2') {
          sh 'mv bootstrap/target/abl-lsp-*.jar resources/abl-lsp.jar && mv bootstrap-dap/target/abl-dap-*.jar resources/abl-dap.jar'
          sh 'mv openedge-plugin/target/sonar-openedge-plugin-*.jar resources/sonar-openedge-plugin.jar'
          sh 'mv plugin/target/riverside-rules-plugin-*.jar resources/riverside-rules-plugin.jar'
          sh 'mv plugin/target/progress-rules-plugin-*.jar resources/progress-rules-plugin.jar'
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