export interface IProductionSetupInput {
  readonly directory: string;
  readonly publicOrigin: string;
  readonly backendOrigin: string;
}

export function initializeProduction(input: IProductionSetupInput): Promise<void>;
