export interface FileInfo {
  projectInfo?: ProjectInfo;
  sourceDir?: string;
  buildDir?: string;
  rcode?: string;
  xref?: string;
  relativePath?: string;
}

export interface ProjectInfo {
  projectRoot?: string;
  sourceDirs?: string;
  buildDirs?: string;
  xrefDirs?: string;
  propath?: string;
  rcodeCache?: string;
  propathRCodeCache?: string;
  schemaCache?: string;
  catalog?: string;
  encoding?: string;
}
