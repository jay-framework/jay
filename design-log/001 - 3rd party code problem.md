# Extending user interface with 3rd party components

The problem of extending user interfaces with 3rd party components is quite common - and has one known resolution.
Consider any kind of dashboard or website that needs to include components from a 3rd party while ensuring the 3rd party
does not have access to the host cookies, assets or REST APIs. The standard tool on the web is using **IFrames**, which
solves the problem using multiple domains, and the browser security model.

However, IFrames have a host of problems - from loading times to limited flexibility - no simple solution to overflow the IFrame boundaries
for things like modal dialogs. IFrames are not built for many small frames - consider a table at which each cell should be an IFrame...
or consider compositions of component in component...

![IFrame vs Jay security model](./Into%20to%20Jay%203.png 'IFrame vs Jay security model')

Jay as a potential of solving this problem by introducing two new concepts - **Jay Element** and **Jay Component**.
**Jay Element** is what the Jay File contains, and what the developer imports. Because it is logic free, it is safe to
run on the main window. **Jay Component** is the code the developer writes that imports the Jay Element. It is unsafe as it includes
3rd party code - and those has to run inside an IFrame. However, Jay can run the **all Jay Components in a single IFrame** while supporting
multiple components on the page, including component in component and such.
