FROM docker.rssw.eu/progress/dlc:12.2.10 AS dlc

FROM codercom/code-server:4.6.0
USER root
COPY --from=dlc /opt/progress/dlc/ /opt/progress/dlc/
COPY --from=dlc /opt/java/openjdk/ /opt/java/openjdk/
RUN /opt/progress/dlc/bin/proDebugEnable -enable-all

USER coder
COPY --chown=coder:coder openedge-abl-lsp-1.3.6.vsix /home/coder
COPY --chown=coder:coder stephenwassell.light-high-contrast-theme-1.1.5.vsix /home/coder
WORKDIR /home/coder
RUN code-server --install-extension openedge-abl-lsp-1.3.6.vsix && code-server --install-extension stephenwassell.light-high-contrast-theme-1.1.5.vsix && rm /home/coder/*.vsix && mkdir /home/coder/.rssw
EXPOSE 8080
COPY --chown=coder:coder oedoc.bin /home/coder/.rssw/oedoc.bin
COPY --chown=coder:coder user-settings.json /home/coder/.local/share/code-server/User/settings.json
COPY --chown=coder:coder machine-settings.json /home/coder/.local/share/code-server/Machine/settings.json
RUN mkdir /home/coder/ws
ENV JAVA_HOME=/opt/java/openjdk DLC=/opt/progress/dlc
ENTRYPOINT [ "/usr/bin/entrypoint.sh", "--auth=none", "--bind-addr=0.0.0.0:8080", "/home/coder/ws" ]
