import { Contract } from '@algorandfoundation/algorand-typescript'

export class Tradeflow extends Contract {
  public hello(name: string): string {
    return `Hello, ${name}`
  }
}
