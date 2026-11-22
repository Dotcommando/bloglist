export interface IPrepareSiteDeploymentInput {
  readonly siteId: string;
  readonly actorId?: string;
}

export interface IPrepareSiteDeploymentResult {
  readonly siteId: string;
  readonly releaseId: string;
  readonly directory: string;
  readonly files: number;
  readonly originFiles?: readonly string[];
  readonly exportId?: string;
}

export interface IPrepareSiteDeployment {
  execute(input: IPrepareSiteDeploymentInput): Promise<IPrepareSiteDeploymentResult>;
}
