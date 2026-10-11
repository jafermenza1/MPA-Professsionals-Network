export class NotificationProvider { async send(){throw new Error("No notification provider configured.");} }
export class NotificationService { constructor(provider){this.provider=provider;} async send(command){return this.provider.send(command);} }
