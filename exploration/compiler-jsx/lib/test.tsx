import { h } from './jay-file';

const Button = ({ msg }) => {
    return (
        <button onclick={() => alert(msg)}>
            <strong>Click me</strong>
        </button>
    );
};

const el = (one, two) => (
    <div>
        <h1 className="what">Hello world {one}</h1>
        <p>
            Lorem ipsum dolor sit, amet consectetur adipisicing elit. Quae sed consectetur placeat
            veritatis {two}
            illo vitae quos aut unde doloribus, minima eveniet et eius voluptatibus minus aperiam
            sequi asperiores, odio ad?
        </p>
        <Button msg="Yay" />
        <Button msg="Nay" />
    </div>
);
