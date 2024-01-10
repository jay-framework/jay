declare interface MyType {
    firstName: string,
    lastName: string
}

type assert1 = Pick<MyType, "firstName">
