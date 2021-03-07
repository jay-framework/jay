start
  = template

template
  = head:string tail:("{" _ expression _ '}' string)* {
    return tail.reduce(function(result, element) {
      console.log(element)
      return result + element[2] + element[5];
    }, head);
  }

expression
  = string

additive
  = left:multiplicative "+" right:additive { return left + right; }
  / multiplicative

multiplicative
  = left:primary "*" right:multiplicative { return left * right; }
  / primary

primary
  = integer
  / "(" additive:additive ")" { return additive; }

integer "integer"
  = _ [0-9]+ { return text() }

_ "whitespace"
  = [ \t\n\r]*

string
  = [^{}]* { return text()}