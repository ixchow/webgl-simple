
function readScript(script) {
	var ret = "";
	var currentChild = script.firstChild;
	 
	while(currentChild) {
		if (currentChild.nodeType == currentChild.TEXT_NODE) {
			ret += currentChild.textContent;
		}
		currentChild = currentChild.nextSibling;
	}
	return ret;
}

function compileScript(script) {
	var shaderType;
	if (script.type === "x-shader/x-glsl-vertex") {
		shaderType = gl.VERTEX_SHADER;
	} else if (script.type === "x-shader/x-glsl-fragment") {
		shaderType = gl.FRAGMENT_SHADER;
	} else {
		throw new Error("Failed to compile shader " + script.id + " because type " + script.type + " was not known.");
	}
	var shader = gl.createShader(shaderType);
	var source = readScript(script);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error("Failed to compile shader " + script.id + ": " + gl.getShaderInfoLog(vs));
	}
	return shader;
}

function init() {
	var canvas = document.getElementsByTagName("canvas")[0];

	//Create webgl context:
	(function createContext() {
		var attribs = { antialias:false };
		window.gl = canvas.getContext('webgl', attribs) || canvas.getContext("experimental-webgl", attribs);

		if (!window.gl) {
			throw new Error("Cannot create webgl context");
		}
	})();

	
	//Init shaders:
	var program = gl.createProgram();
	(function compileShaders(){
		var vertexShader = compileScript(document.getElementById("vertexShader"));
		var fragmentShader = compileScript(document.getElementById("fragmentShader"));

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
	
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error("Unable to link shader program.");
		}

		//store information about program attributes:
		var na = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
		for (var i = 0; i < na; ++i) {
			var a = gl.getActiveAttrib(program, i);
			program[a.name] = {
				location:gl.getAttribLocation(program, a.name),
				type:a.type,
				size:a.size
			};
		}

		//store information about program uniforms:
		var nu = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < nu; ++i) {
			var u = gl.getActiveUniform(program, i);
			program[u.name] = {
				location:gl.getUniformLocation(program, u.name),
				type:a.type,
				size:a.size
			};
		}
	})();

	window.program = program;

	//rendering loop:
	var previous = NaN;
	window.time = 0.0;
	function render(timestamp) {
		gl.clearColor(0.5, 0.5, 0.5, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

		if (isNaN(previous)) {
			previous = timestamp;
		}
		var elapsed = (timestamp - previous) / 1000.0;
		previous = timestamp;

		if(elapsed > .1) elapsed = .1;

		window.time += elapsed;
		window.elapsed = elapsed;

		gl.useProgram(program);

		render.warned = render.warned || {};

		var attributes = makeAttributes();
		var count;
		for (var name in attributes) {
			var value = attributes[name];
			if (typeof(value.size) === "undefined") {
				value.size = 4;
			}
			if (value.length % value.size != 0) {
				throw new Error("Number of values (" + value.length + ") provided for '" + name + "' not evenly divisble by attribute size (" + value.size + ")");
			}
			if (typeof(count) === "undefined") {
				count = value.length / value.size;
			}
			if (count != value.length / value.size) {
				throw new Error("Attribute count mis-match for '" + name + "'.");
			}

			//warn about unused attributes:
			if (!(name in program)) {
				if (!(name in render.warned)) {
					console.warn("Attribute '" + name + "' specified, but not used in shaders.");
					render.warned[name] = true;
				}
			}

			value.glBuffer = value.glBuffer || gl.createBuffer();

			gl.bindBuffer(gl.ARRAY_BUFFER, value.glBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, value, gl.STREAM_DRAW);
		}

		var na = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
		for (var i = 0; i < na; ++i) {
			var a = gl.getActiveAttrib(program, i);
			var loc = gl.getAttribLocation(program, a.name);

			if (!(a.name in attributes)) {
				//warn if not specified:
				if (!(a.name in render.warned)) {
					console.warn("Attribute '" + a.name + "' used in shaders but not specified.");
					render.warned[a.name] = true;
				}
				gl.disableVertexAttribArray(loc);
				gl.vertexAttrib4f(loc, 0.0, 0.0, 0.0, 1.0);
			} else {
				var value = attributes[a.name];
				gl.bindBuffer(gl.ARRAY_BUFFER, value.glBuffer);
				gl.vertexAttribPointer(loc, value.size, gl.FLOAT, false, 0, 0);
				gl.enableVertexAttribArray(loc);
			}
		}

		var uniforms = makeUniforms();
		for (var name in uniforms) {
			//warn about unused uniforms:
			if (!(name in program)) {
				if (!(name in render.warned)) {
					console.warn("Uniform '" + name + "' specified, but not used in shaders.");
					render.warned[name] = true;
				}
			}
		}

		var nu = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < nu; ++i) {
			var u = gl.getActiveUniform(program, i);
			var loc = gl.getUniformLocation(program, u.name);

			if (!(u.name in uniforms)) {
				//error if not specified:
				throw new Error("Uniform '" + u.name + "' used in shaders but not specified.");
			}
			var value = uniforms[u.name];
			if (u.type === gl.FLOAT) {
				if (value.length !== 1) {
					throw new Error("Uniform '" + u.name + "' is a float, but value given is of length " + value.length);
				}
				gl.uniform1fv(loc, value);
			} else if (u.type === gl.FLOAT_VEC2) {
				if (value.length !== 2) {
					throw new Error("Uniform '" + u.name + "' is a vec2, but value given is of length " + value.length);
				}
				gl.uniform2fv(loc, value);
			} else if (u.type === gl.FLOAT_VEC3) {
				if (value.length !== 3) {
					throw new Error("Uniform '" + u.name + "' is a vec3, but value given is of length " + value.length);
				}
				gl.uniform3fv(loc, value);
			} else if (u.type === gl.FLOAT_VEC4) {
				if (value.length !== 4) {
					throw new Error("Uniform '" + u.name + "' is a vec4, but value given is of length " + value.length);
				}
				gl.uniform4fv(loc, value);
			} else if (u.type === gl.FLOAT_MAT2) {
				if (value.length !== 2*2) {
					throw new Error("Uniform '" + u.name + "' is a mat2, but value given is of length " + value.length);
				}
				gl.uniformMatrix2fv(loc, false, value);
			} else if (u.type === gl.FLOAT_MAT3) {
				if (value.length !== 3*3) {
					throw new Error("Uniform '" + u.name + "' is a mat3, but value given is of length " + value.length);
				}
				gl.uniformMatrix3fv(loc, false, value);
			} else if (u.type === gl.FLOAT_MAT4) {
				if (value.length !== 4*4) {
					throw new Error("Uniform '" + u.name + "' is a mat4, but value given is of length " + value.length);
				}
				gl.uniformMatrix4fv(loc, false, value);
			} else {
				throw new Error("Uniform '" + u.name + "' has a type not supported by this code.");
			}
		}



		gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);


		window.requestAnimationFrame(render);
	};

	window.requestAnimationFrame(render);



}
