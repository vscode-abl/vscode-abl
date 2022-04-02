FROM rssw/dlcora:12.2 AS dlc

FROM codercom/code-server:4.1.0
USER root
COPY --from=dlc /opt/progress/dlc/ /opt/progress/dlc/
COPY --from=dlc /opt/java/openjdk/ /opt/java/openjdk/

USER coder
COPY --chown=coder:coder openedge-abl-1.3.3.vsix /home/coder
COPY --chown=coder:coder stephenwassell.light-high-contrast-theme-1.1.5.vsix /home/coder
WORKDIR /home/coder
RUN code-server --install-extension openedge-abl-1.3.3.vsix && code-server --install-extension stephenwassell.light-high-contrast-theme-1.1.5.vsix && rm /home/coder/*.vsix
EXPOSE 8080
COPY --chown=coder:coder user-settings.json /home/coder/.local/share/code-server/User/settings.json
COPY --chown=coder:coder machine-settings.json /home/coder/.local/share/code-server/Machine/settings.json
RUN mkdir /home/coder/ws
ENV JAVA_HOME=/opt/java/openjdk PATH=$PATH:/opt/java/openjdk/bin
ENTRYPOINT [ "/usr/bin/entrypoint.sh", "--auth=password", "--bind-addr=0.0.0.0:8080", "/home/coder/ws" ]

