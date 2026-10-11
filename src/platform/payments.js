export class PaymentProvider {
  async initiate(){throw new Error("No payment provider configured.");}
  async verify(){throw new Error("No payment provider configured.");}
}
export class PaymentService {
  constructor(provider){this.provider=provider;}
  async initiate(command){return this.provider.initiate(command);}
  async verify(command){return this.provider.verify(command);}
}
