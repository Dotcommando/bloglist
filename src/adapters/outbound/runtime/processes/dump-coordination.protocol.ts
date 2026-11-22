export enum DumpCoordinationAction {
  Reserve = 'reserve',
  Capture = 'capture',
  Release = 'release',
}

export enum DumpCoordinationMessageKind {
  Command = 'capacity',
  Result = 'capacity-result',
  Cancel = 'capture-cancel',
}
