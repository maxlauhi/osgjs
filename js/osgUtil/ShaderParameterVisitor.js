/** -*- compile-command: "jslint-cli ShaderParameterVisitor.js" -*-
 * Authors:
 *  Cedric Pinson <cedric.pinson@plopbyte.com>
 */

osgUtil.ShaderParameterVisitor = function() {
    osg.NodeVisitor.call(this);


    var ArraySlider = function() {
        this.params = {};
        this.parent = document.body;
    };

    ArraySlider.prototype = {
        selectParamFromName: function(name) {
            var keys = Object.keys(this.params);
            if (keys.length === 1) {
                return this.params[ keys[0] ];
            }
            for (var i = 0; i < keys.length; i++) {
                var p = this.params[ keys[i] ];
                var matchs = p.match;
                if (matchs === undefined) {
                    matchs = [ keys[i] ];
                }
                for (var m = 0; m < matchs.length; m++) {
                    if (name.search(matchs[m]) !== -1) {
                        return p;
                    }
                }
            }
            return this.params.default;
        },
        readValue: function(name) {
            if (window.localStorage) {
                return window.localStorage.getItem(name);
            }
            return undefined;
        },
        saveValue: function(name, value) {
            if (window.localStorage) {
                window.localStorage.setItem(name, value);
            }
        },
        addToDom: function(content) {
            var mydiv = document.createElement('div');
            mydiv.innerHTML = content;
            this.parent.appendChild(mydiv);
        },
        createSlider: function(min, max, step, value, name, cbname) {
            // read local storage value if it exist
            var readValue = this.readValue();
            if (readValue !== undefined) {
                value = readValue;
            }

            var input = '<div>NAME [ MIN - MAX ] <input type="range" min="MIN" max="MAX" value="VALUE" step="STEP" onchange="ONCHANGE" /><span id="NAME"></span></div>';
            var onchange = cbname + '(this.value)';
            input = input.replace(/MIN/g, min);
            input = input.replace(/MAX/g, max);
            input = input.replace('STEP', step);
            input = input.replace('VALUE', value);
            input = input.replace(/NAME/g, name);
            input = input.replace('ONCHANGE', onchange);
            return input;
        },

        createFunction: function(name, index, uniform, cbnameIndex) {
            return (function() {
                var cname = name;
                var cindex = index;
                var cuniform = uniform;
                var func = function(value) {
                    cuniform.get()[cindex] = value;
                    cuniform.dirty();
                    osg.log(cname + ' value ' + value);
                    document.getElementById(cname).innerHTML = Number(value).toFixed(4);
                    // store the value to localstorage
                };
                return func;
            })();
        },

        createEntrySlider: function(uniform, params, name, index, cbname) {
            var istring = index.toString();
            var nameIndex = name + istring;
            var cbnameIndex = cbname+istring
            var dom = this.createSlider(params.min, params.max, params.step, params.value[index], nameIndex, cbnameIndex);
            this.addToDom(dom);
            window[cbnameIndex] = this.createFunction(nameIndex, index, uniform, cbnameIndex);
        },
        getCallbackName: function(name, prgId) {
            return 'change_'+prgId+"_"+name;
        },

        createInternalSlider: function(name, dim, uniformFunc, prgId) {
            var params = this.selectParamFromName(name);
            var value = params.value();
            var uniform = uniformFunc(value, name);
            var cbname = this.getCallbackName(name, prgId);
            for (var i = 0; i < dim; i++) {
                this.createEntrySlider(uniform, params, name, i, cbname);
            }
            this.uniform = uniform;
            return uniform;
        }
    };

    var Vec4Slider = function() {
        ArraySlider.call(this);
        this.params['color'] = { 'min': 0,
                                 'max': 1.0,
                                 'step':0.01,
                                 'value': function() { return [0.5, 0.5, 0.5, 1.0]; },
                                 'match' : ['color', 'diffuse', 'specular', 'ambient', 'emission']
                               };
        this.params['default'] = this.params['color'];
        
    };
    Vec4Slider.prototype = osg.objectInehrit(ArraySlider.prototype, {
        create: function(name, prgId) {
            return this.createInternalSlider(name, 4, osg.Uniform.createFloat4, prgId);
        }
    });

    var Vec3Slider = function() {
        ArraySlider.call(this);
        this.params['position'] = { 'min': -50,
                                    'max': 50.0,
                                    'step':0.1,
                                    'value': function() { return [0.0, 0.0, 0.0]; },
                                    'match' : ['position']
                                  };
        this.params['normalized'] = { 'min': 0,
                                      'max': 1.0,
                                      'step':0.01,
                                      'value': function() { return [1.0, 0.0, 0.0]; },
                                      'match' : ['normal', 'direction']
                                    };
        this.params['default'] = this.params['position'];
    };
    Vec3Slider.prototype = osg.objectInehrit(ArraySlider.prototype, {
        create: function(name, prgId) {
            return this.createInternalSlider(name, 3, osg.Uniform.createFloat3, prgId);
        }
    });


    var Vec2Slider = function() {
        ArraySlider.call(this);
        this.params['uv'] = { 'min': -1,
                                    'max': 1.0,
                                    'step':0.01,
                                    'value': function() { return [0.0, 0.0]; },
                                    'match' : ['texcoord, uv']
                                  };
        this.params['default'] = this.params['uv'];
    };
    Vec2Slider.prototype = osg.objectInehrit(ArraySlider.prototype, {
        create: function(name, prgId) {
            return this.createInternalSlider(name, 2, osg.Uniform.createFloat2, prgId);
        }
    });


    var FloatSlider = function() {
        ArraySlider.call(this);
        this.params['default'] = { 'min': -1,
                             'max': 1.0,
                             'step':0.01,
                             'value': function() { return [0.0]; },
                             'match' : []
                           };
    };
    FloatSlider.prototype = osg.objectInehrit(ArraySlider.prototype, {
        create: function(name, prgId) {
            return this.createInternalSlider(name, 1, osg.Uniform.createFloat1, prgId);
        }
    });

    this.types = {};
    this.types.vec4 = new Vec4Slider();
    this.types.vec3 = new Vec3Slider();
    this.types.vec2 = new Vec2Slider();
    this.types.float = new FloatSlider();

};

osgUtil.ShaderParameterVisitor.prototype = osg.objectInehrit(osg.NodeVisitor.prototype, {

    getUniformList: function(str, map) {
        var r = str.match(/uniform\s+\w+\s+\w+/g);
        var list = map;
        if (r !== null) {
            for (var i = 0, l = r.length; i < l; i++) {
                var result = r[i].match(/uniform\s+(\w+)\s+(\w+)/);
                var name = result[2];
                var uniform = { 'type': result[1], 'name': name};
                list[name] = uniform;
            }
        }
        return list;
    },
    
    applyStateSet: function(stateset) {
        if (stateset.getAttribute('Program') === undefined) {
            return;
        }
        var program = stateset.getAttribute('Program');
        var programName = program.getName();
        var string = program.getVertexShader().getText();
        var uniformMap = {};
        this.getUniformList(program.getVertexShader().getText(), uniformMap);
        this.getUniformList(program.getFragmentShader().getText(), uniformMap);


        var keys = Object.keys(uniformMap);

        if (programName === undefined) {
            var str = keys.join();
            programName = atob(str);
        }

        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var entry = uniformMap[k];
            var type = entry.type;
            var name = entry.name;
            if (this.types[type] !== undefined) {
                var uniform = this.types[type].create(name, programName);
                if (uniform) {
                    stateset.addUniform(uniform);
                }
            }
        }
        osg.log(uniformMap);
    },

    apply: function(node) {
        var st = node.getStateSet();
        if (st !== undefined) {
            this.applyStateSet(st);
        }

        this.traverse(node);
    }
});
