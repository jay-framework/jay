// exploring the APIs for SVG dynamic element creation
window.onload = () => {
    const target = document.getElementById('target');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('height', '200');
    svg.setAttribute('width', '200');
    svg.setAttribute('id', 'test2');

    var svgimg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    svgimg.setAttribute('height', '100');
    svgimg.setAttribute('width', '100');
    svgimg.setAttribute('id', 'testimg2');
    svgimg.setAttribute('href', 'http://i.imgur.com/LQIsf.jpg');
    svgimg.setAttribute('x', '0');
    svgimg.setAttribute('y', '0');

    svgimg.onclick = () => {
        console.log('hi');
    };

    svg.appendChild(svgimg);

    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.appendChild(document.createTextNode('hi'));

    target.appendChild(svg);
    target.appendChild(div);
};
