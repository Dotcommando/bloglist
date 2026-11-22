export interface IContainerResourceObservation {
  readonly databaseCpu: number | null;
  readonly cmsCpu: number | null;
  readonly databaseImage: string | null;
}

export interface IContainerResourcesPort {
  observe(): Promise<IContainerResourceObservation>;
  apply(input: { readonly databaseCpu: number; readonly cmsCpu: number }): Promise<IContainerResourceObservation>;
}
