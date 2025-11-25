import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface StudentOfClassAOfNestedArraysWithStudentsViewState {
    name: string;
    grade: number;
    id: string;
}

export interface ClassAOfNestedArraysWithStudentsViewState {
    id: string;
    className: string;
    students: Array<StudentOfClassAOfNestedArraysWithStudentsViewState>;
}

export interface StudentOfClassBOfNestedArraysWithStudentsViewState {
    name: string;
    grade: number;
    id: string;
}

export interface ClassBOfNestedArraysWithStudentsViewState {
    id: string;
    className: string;
    students: Array<StudentOfClassBOfNestedArraysWithStudentsViewState>;
}

export interface NestedArraysWithStudentsViewState {
    classA: Array<ClassAOfNestedArraysWithStudentsViewState>;
    classB: Array<ClassBOfNestedArraysWithStudentsViewState>;
}

export interface NestedArraysWithStudentsElementRefs {
    classA: {
        className: HTMLElementCollectionProxy<
            ClassAOfNestedArraysWithStudentsViewState,
            HTMLHeadingElement
        >;
        students: {
            name: HTMLElementCollectionProxy<
                StudentOfClassAOfNestedArraysWithStudentsViewState,
                HTMLSpanElement
            >;
            grade: HTMLElementCollectionProxy<
                StudentOfClassAOfNestedArraysWithStudentsViewState,
                HTMLSpanElement
            >;
        };
    };
    classB: {
        className: HTMLElementCollectionProxy<
            ClassBOfNestedArraysWithStudentsViewState,
            HTMLHeadingElement
        >;
        students: {
            name: HTMLElementCollectionProxy<
                StudentOfClassBOfNestedArraysWithStudentsViewState,
                HTMLSpanElement
            >;
            grade: HTMLElementCollectionProxy<
                StudentOfClassBOfNestedArraysWithStudentsViewState,
                HTMLSpanElement
            >;
        };
    };
}

export type NestedArraysWithStudentsSlowViewState = {};
export type NestedArraysWithStudentsFastViewState = {};
export type NestedArraysWithStudentsInteractiveViewState = NestedArraysWithStudentsViewState;

export type NestedArraysWithStudentsElement = JayElement<
    NestedArraysWithStudentsViewState,
    NestedArraysWithStudentsElementRefs
>;
export type NestedArraysWithStudentsElementRender = RenderElement<
    NestedArraysWithStudentsViewState,
    NestedArraysWithStudentsElementRefs,
    NestedArraysWithStudentsElement
>;
export type NestedArraysWithStudentsElementPreRender = [
    NestedArraysWithStudentsElementRefs,
    NestedArraysWithStudentsElementRender,
];
export type NestedArraysWithStudentsContract = JayContract<
    NestedArraysWithStudentsViewState,
    NestedArraysWithStudentsElementRefs,
    NestedArraysWithStudentsSlowViewState,
    NestedArraysWithStudentsFastViewState,
    NestedArraysWithStudentsInteractiveViewState
>;

export function render(options?: RenderElementOptions): NestedArraysWithStudentsElementPreRender {
    const [studentsRefManager, [refName, refGrade]] = ReferencesManager.for(
        options,
        [],
        ['name', 'grade'],
        [],
        [],
    );
    const [classARefManager, [refClassName]] = ReferencesManager.for(
        options,
        [],
        ['className'],
        [],
        [],
        {
            students: studentsRefManager,
        },
    );
    const [studentsRefManager2, [refName2, refGrade2]] = ReferencesManager.for(
        options,
        [],
        ['name', 'grade'],
        [],
        [],
    );
    const [classBRefManager, [refClassName2]] = ReferencesManager.for(
        options,
        [],
        ['className'],
        [],
        [],
        {
            students: studentsRefManager2,
        },
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        classA: classARefManager,
        classB: classBRefManager,
    });
    const render = (viewState: NestedArraysWithStudentsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, ['Class A']),
                forEach(
                    (vs: NestedArraysWithStudentsViewState) => vs.classA,
                    (vs1: ClassAOfNestedArraysWithStudentsViewState) => {
                        return de('div', {}, [
                            e('h2', {}, [dt((vs1) => vs1.className)], refClassName()),
                            forEach(
                                (vs1: ClassAOfNestedArraysWithStudentsViewState) => vs1.students,
                                (vs2: StudentOfClassAOfNestedArraysWithStudentsViewState) => {
                                    return e('div', {}, [
                                        e('span', {}, [dt((vs2) => vs2.name)], refName()),
                                        e('span', {}, [dt((vs2) => vs2.grade)], refGrade()),
                                    ]);
                                },
                                'id',
                            ),
                        ]);
                    },
                    'id',
                ),
                e('h1', {}, ['Class B']),
                forEach(
                    (vs: NestedArraysWithStudentsViewState) => vs.classB,
                    (vs1: ClassBOfNestedArraysWithStudentsViewState) => {
                        return de('div', {}, [
                            e('h2', {}, [dt((vs1) => vs1.className)], refClassName2()),
                            forEach(
                                (vs1: ClassBOfNestedArraysWithStudentsViewState) => vs1.students,
                                (vs2: StudentOfClassBOfNestedArraysWithStudentsViewState) => {
                                    return e('div', {}, [
                                        e('span', {}, [dt((vs2) => vs2.name)], refName2()),
                                        e('span', {}, [dt((vs2) => vs2.grade)], refGrade2()),
                                    ]);
                                },
                                'id',
                            ),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as NestedArraysWithStudentsElement;
    return [refManager.getPublicAPI() as NestedArraysWithStudentsElementRefs, render];
}
