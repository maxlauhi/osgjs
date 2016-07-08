'use strict';
var Map = require( 'osg/Map' );
var mat4 = require( 'osg/glMatrix' ).mat4;
var Notify = require( 'osg/notify' );
var Object = require( 'osg/Object' );
var Program = require( 'osg/Program' );
var StateAttribute = require( 'osg/StateAttribute' );
var Stack = require( 'osg/Stack' );
var Uniform = require( 'osg/Uniform' );
var MACROUTILS = require( 'osg/Utils' );
var WebGLCaps = require( 'osg/WebGLCaps' );


var checkUniformCache = [
    undefined,
    function uniformCheck1( uniformArray, cacheArray ) {
        if ( uniformArray[ 0 ] === cacheArray[ 0 ] ) return true;
        cacheArray[ 0 ] = uniformArray[ 0 ];
        return false;
    },

    function uniformCheck2( uniformArray, cacheArray ) {
        if ( uniformArray[ 0 ] === cacheArray[ 0 ] && uniformArray[ 1 ] === cacheArray[ 1 ] ) return true;
        cacheArray[ 0 ] = uniformArray[ 0 ];
        cacheArray[ 1 ] = uniformArray[ 1 ];
        return false;
    },

    function uniformCheck3( uniformArray, cacheArray ) {
        if ( uniformArray[ 0 ] === cacheArray[ 0 ] && uniformArray[ 1 ] === cacheArray[ 1 ] && uniformArray[ 2 ] === cacheArray[ 2 ] ) return true;
        cacheArray[ 0 ] = uniformArray[ 0 ];
        cacheArray[ 1 ] = uniformArray[ 1 ];
        cacheArray[ 2 ] = uniformArray[ 2 ];
        return false;
    },

    function uniformCheck4( uniformArray, cacheArray ) {
        if ( uniformArray[ 0 ] === cacheArray[ 0 ] && uniformArray[ 1 ] === cacheArray[ 1 ] && uniformArray[ 2 ] === cacheArray[ 2 ] && uniformArray[ 3 ] === cacheArray[ 3 ] ) return true;
        cacheArray[ 0 ] = uniformArray[ 0 ];
        cacheArray[ 1 ] = uniformArray[ 1 ];
        cacheArray[ 2 ] = uniformArray[ 2 ];
        cacheArray[ 3 ] = uniformArray[ 3 ];
        return false;
    }
];


var State = function ( shaderGeneratorProxy ) {
    Object.call( this );

    this._graphicContext = undefined;
    this._shaderGeneratorProxy = shaderGeneratorProxy;

    if ( shaderGeneratorProxy === undefined )
        console.break();

    this._currentVAO = null;
    this._currentIndexVBO = null;

    this.vertexAttribList = [];
    this.stateSets = new Stack();
    this._shaderGeneratorNames = new Stack();
    this.uniforms = new Map();

    this.textureAttributeArrayList = [];
    this._attributeArray = [];

    this.modelMatrix = Uniform.createMatrix4( mat4.create(), 'uModelMatrix' );
    this.viewMatrix = Uniform.createMatrix4( mat4.create(), 'uViewMatrix' );
    this.modelViewMatrix = Uniform.createMatrix4( mat4.create(), 'uModelViewMatrix' );
    this.projectionMatrix = Uniform.createMatrix4( mat4.create(), 'uProjectionMatrix' );
    this.modelViewNormalMatrix = Uniform.createMatrix4( mat4.create(), 'uModelViewNormalMatrix' );

    // track uniform for color array enabled
    var arrayColorEnable = new Stack();
    arrayColorEnable.globalDefault = Uniform.createFloat1( 0.0, 'uArrayColorEnabled' );

    this.uniforms.setMap( {
        ArrayColorEnabled: arrayColorEnable
    } );


    this._previousColorAttribPair = {};
    this.vertexAttribMap = {};
    this.vertexAttribMap._disable = [];
    this.vertexAttribMap._keys = [];

    this._frameStamp = undefined;

    // we dont use Map because in this use case with a few entries
    // {} is faster
    this._programCommonUniformsCache = {};

    // keep pointer on the last applied modelview matrix
    this._modelViewMatrix = undefined;
    // keep pointer on the last applied projection matrix
    this._projectionMatrix = undefined;

    this.lastAppliedAttribute = [];
    this.lastAppliedTextureAttribute = [];
    this.lastAppliedAttributeLength = 0;
    this.lastAppliedTextureAttributeLength = 0;

    // keep track of last applied program
    this._program = undefined;
    // inject a default program to initialize the stack Program
    var program = new Program();
    this.applyAttribute( program );

    // cache programAttribute access
    this._programType = MACROUTILS.getOrCreateStateAttributeTypeMemberIndex( program );
    this._programAttribute = this._attributeArray[ this._programType ];


    this._numPushStateSet = 0;
    this._numApply = 0;

    this._programUniformCache = [];
    this._cacheUniformId = 0;


    this.resetStats();

};


MACROUTILS.createPrototypeClass( State, MACROUTILS.objectInherit( Object.prototype, {

    getCacheUniformsApplyRenderLeaf: function () {
        return this._programCommonUniformsCache;
    },

    setGraphicContext: function ( graphicContext ) {
        this._graphicContext = graphicContext;
        this._extVAO = WebGLCaps.instance( graphicContext ).getWebGLExtension( 'OES_vertex_array_object' );
    },

    getGraphicContext: function () {
        return this._graphicContext;
    },

    getShaderGeneratorProxy: function () {
        return this._shaderGeneratorProxy;
    },

    pushCheckOverride: function ( stack, object, maskValue ) {

        var result = this._evaluateOverrideObjectOnStack( stack, object, maskValue );
        var objectPair;

        // override and protected case
        if ( result !== object ) objectPair = this.getObjectPair( result, stack.back.value );
        else objectPair = this.getObjectPair( object, maskValue );

        stack.push( objectPair );

    },

    _evaluateOverrideObjectOnStack: function ( stack, object, maskValue ) {
        var back = stack.back;
        // object can be a Uniform, an Attribute, or a shader generator name
        if ( stack.values.length === 0 ) {

            return object;

        } else if ( ( back.value & StateAttribute.OVERRIDE ) &&
                    !( maskValue & StateAttribute.PROTECTED ) ) {

            return back.object;

        } else {

            return object;

        }
    },

    pushStateSet: function ( stateset ) {
        this._numPushStateSet++;
        this.stateSets.push( stateset );

        this.pushAttributeMap( this._attributeArray, stateset._attributeArray, stateset._activeAttribute );

        var textureAttributeArrayList = stateset._textureAttributeArrayList;
        var activeTextureUnits = stateset._activeTextureAttributeUnit;
        var activeTextureAttribute = stateset._activeTextureAttribute;

        for ( var i = 0, l = activeTextureUnits.length; i < l; i++ ) {
            var unit = activeTextureUnits[ i ];
            var _attributeArray = textureAttributeArrayList[ unit ];

            var textureUnitAttributeArray = this.getOrCreateTextureAttributeArray( unit );
            this.pushAttributeMap( textureUnitAttributeArray, _attributeArray, activeTextureAttribute );
        }

        if ( stateset.uniforms.getKeys().length ) this.pushUniformsList( this.uniforms, stateset.uniforms );

        var generatorPair = stateset.getShaderGeneratorPair();
        if ( generatorPair )
            this.pushCheckOverride( this._shaderGeneratorNames, generatorPair.getShaderGeneratorName(), generatorPair.getValue() );
    },

    getStateSetStackSize: function () {
        return this.stateSets.values.length;
    },

    insertStateSet: ( function () {
        var tmpStack = [];

        return function ( pos, stateSet ) {

            tmpStack.length = 0;
            var length = this.getStateSetStackSize();
            while ( length > pos ) {
                tmpStack.push( this.stateSets.back );
                this.popStateSet();
                length--;
            }

            this.pushStateSet( stateSet );

            for ( var i = tmpStack.length - 1; i >= 0; i-- ) {
                this.pushStateSet( tmpStack[ i ] );
            }

        };
    } )(),

    removeStateSet: ( function () {
        var tmpStack = [];

        return function ( pos ) {

            var length = this.getStateSetStackSize();
            if ( pos >= length ) {
                Notify.warn( 'Warning State:removeStateSet ' + pos + ' out of range' );
                return;
            }

            tmpStack.length = 0;

            // record the StateSet above the one we intend to remove
            while ( length - 1 > pos ) {
                tmpStack.push( this.stateSets.back );
                this.popStateSet();
                length--;
            }

            // remove the intended StateSet as well
            this.popStateSet();

            // push back the original ones that were above the remove StateSet
            for ( var i = tmpStack.length - 1; i >= 0; i-- ) {
                this.pushStateSet( tmpStack[ i ] );
            }

        };
    } )(),


    // needed because we use a cache during the frame to avoid
    // applying uniform or operation. At each frame we need to
    // invalidate those informations
    resetCacheFrame: function () {
        this._modelViewMatrix = this._projectionMatrix = undefined;
    },

    resetStats: function () {
        this._numApply = 0;
        this._numPushStateSet = 0;

    },

    // apply program if needed
    applyProgram: function ( program ) {
        if ( this._program === program ) return;
        this._program = program;
        this.getGraphicContext().useProgram( program );
    },

    applyModelViewMatrix: ( function () {

        var normal = mat4.create();

        return function StateApplyModelViewMatrix( matrix ) {

            if ( this._modelViewMatrix === matrix ) return false;

            var program = this.getLastProgramApplied();
            var uniformCache = program.getUniformsCache();
            var mu = this.modelViewMatrix;
            var mul = uniformCache.uModelViewMatrix;
            var gc = this.getGraphicContext();
            if ( mul ) {

                mu.setMatrix4( matrix );
                mu.apply( gc, mul );
            }

            var sendNormal;
            if ( this._modelViewMatrix ) {

                // check if we need to push normal
                // test rotation component, if not diff
                // we dont need to send normal
                var m2 = this._modelViewMatrix;
                for ( var i = 0; i < 11; i++ ) {
                    if ( matrix[ i ] !== m2[ i ] ) {
                        sendNormal = true;
                        break;
                    }
                }
            } else {
                sendNormal = true;
            }

            if ( sendNormal ) {
                mu = this.modelViewNormalMatrix;
                mul = uniformCache.uModelViewNormalMatrix;
                if ( mul ) {

                    normal[ 0 ] = matrix[ 0 ];
                    normal[ 1 ] = matrix[ 1 ];
                    normal[ 2 ] = matrix[ 2 ];
                    normal[ 4 ] = matrix[ 4 ];
                    normal[ 5 ] = matrix[ 5 ];
                    normal[ 6 ] = matrix[ 6 ];
                    normal[ 8 ] = matrix[ 8 ];
                    normal[ 9 ] = matrix[ 9 ];
                    normal[ 10 ] = matrix[ 10 ];

                    mat4.invert( normal, normal );
                    mat4.transpose( normal, normal );

                    mu.setMatrix4( normal );
                    mu.apply( gc, mul );
                }
            }

            this._modelViewMatrix = matrix;
            return true;
        };
    } )(),


    applyModelViewMatrixEperiment: ( function () {

        var normal = mat4.create();

        var checkMatrix = function ( m0, m1 ) {
            if ( m0[ 0 ] !== m1[ 0 ] ) return true;
            if ( m0[ 1 ] !== m1[ 1 ] ) return true;
            if ( m0[ 2 ] !== m1[ 2 ] ) return true;
            if ( m0[ 4 ] !== m1[ 4 ] ) return true;
            if ( m0[ 5 ] !== m1[ 5 ] ) return true;
            if ( m0[ 6 ] !== m1[ 6 ] ) return true;
            if ( m0[ 8 ] !== m1[ 8 ] ) return true;
            if ( m0[ 9 ] !== m1[ 9 ] ) return true;
            if ( m0[ 10 ] !== m1[ 10 ] ) return true;
            return false;
        };

        var epsilon = 1e-6;
        var scaleEpsilonMax = 1.0 + epsilon;
        var scaleEpsilonMin = 1.0 - epsilon;

        return function StateApplyModelViewMatrix( matrix ) {
            if ( this._modelViewMatrix === matrix ) return false;

            var program = this.getLastProgramApplied();

            var mu = this.modelViewMatrix;
            var mul = program.getUniformsCache().uModelViewMatrix;
            if ( mul ) {

                mu.setMatrix4( matrix );
                mu.apply( this.getGraphicContext(), mul );
            }

            var sendNormal = true;
            if ( this._modelViewMatrix ) {
                sendNormal = checkMatrix( matrix, this._modelViewMatrix );
                // check if we need to push normal
                // test rotation component, if not diff
                // we dont need to send normal
                // for ( var i = 0; i < 11; i++ ) {
                //     if ( matrix[ i ] !== this._modelViewMatrix[ i ] ) {
                //         sendNormal = true;
                //         break;
                //     }
                // }
            }

            if ( sendNormal ) {
                mu = this.modelViewNormalMatrix;
                mul = program.getUniformsCache().uModelViewNormalMatrix;
                if ( mul ) {

                    // mat4.copy( normal , matrix );
                    normal[ 0 ] = matrix[ 0 ];
                    normal[ 1 ] = matrix[ 1 ];
                    normal[ 2 ] = matrix[ 2 ];
                    normal[ 4 ] = matrix[ 4 ];
                    normal[ 5 ] = matrix[ 5 ];
                    normal[ 6 ] = matrix[ 6 ];
                    normal[ 8 ] = matrix[ 8 ];
                    normal[ 9 ] = matrix[ 9 ];
                    normal[ 10 ] = matrix[ 10 ];

                    // check for scaling
                    var xlen = normal[ 0 ] * normal[ 0 ] + normal[ 4 ] * normal[ 4 ] + normal[ 8 ] * normal[ 8 ];
                    var ylen = normal[ 1 ] * normal[ 1 ] + normal[ 5 ] * normal[ 5 ] + normal[ 9 ] * normal[ 9 ];
                    var zlen = normal[ 2 ] * normal[ 2 ] + normal[ 6 ] * normal[ 6 ] + normal[ 10 ] * normal[ 10 ];

                    // http://www.gamedev.net/topic/637192-detect-non-uniform-scaling-in-matrix/
                    if ( xlen > scaleEpsilonMax || xlen < scaleEpsilonMin ||
                        ylen > scaleEpsilonMax || ylen < scaleEpsilonMin ||
                        zlen > scaleEpsilonMax || zlen < scaleEpsilonMin ) {

                        mat4.invert( normal, normal );
                        mat4.transpose( normal, normal );
                    }

                    mu.setMatrix4( normal );
                    mu.apply( this.getGraphicContext(), mul );
                }
            }

            this._modelViewMatrix = matrix;
            return true;
        };
    } )(),

    applyProjectionMatrix: function ( matrix ) {

        if ( this._projectionMatrix === matrix ) return;

        this._projectionMatrix = matrix;
        var program = this.getLastProgramApplied();
        var mu = this.projectionMatrix;

        var mul = program.getUniformsCache()[ mu.getName() ];
        if ( mul ) {

            mu.setMatrix4( matrix );
            mu.apply( this.getGraphicContext(), mul );

        }
    },

    getCurrentShaderGeneratorStateSet: function ( stateset ) {

        var programStack = this._programAttribute;
        var stateSetProgramPair = stateset._attributeArray[ this._programType ];

        if ( ( programStack.values.length !== 0 && programStack.back.value !== StateAttribute.OFF ) ||
             ( stateSetProgramPair && stateSetProgramPair.getValue() !== StateAttribute.OFF )
           ) return undefined;


        var stateSetGeneratorPair = stateset.getShaderGeneratorPair();
        var generatorStack = this._shaderGeneratorNames;
        var generator;

        if ( stateSetGeneratorPair ) {

            var maskValue = stateSetGeneratorPair.getValue();
            var stateSetGenerator = stateSetGeneratorPair.getShaderGeneratorName();
            generator = this._evaluateOverrideObjectOnStack (this._shaderGeneratorNames, stateSetGenerator , maskValue );

        } else if ( generatorStack.values.length ) {

            generator = generatorStack.back.object;

        }

        // no custom program look into the stack of ShaderGenerator name
        // what we should use to generate a program
        var last = generator;
        var shaderGenerator = this._shaderGeneratorProxy.getShaderGenerator( last );
        return shaderGenerator;
    },

    _applyAttributeMapStateSet: function ( _attributeArray, stateSetAttributeArray ) {

        var max = _attributeArray.length > stateSetAttributeArray.length ? _attributeArray.length : stateSetAttributeArray.length;
        for ( var i = 0, l = max; i < l; i++ ) {

            var attribute;
            var attributeId = i;
            var attributeStack = _attributeArray[ attributeId ];

            var stateSetAttributePair = stateSetAttributeArray[ attributeId ];

            var hasStateAttributeStack = attributeStack !== undefined;
            var hasStateAttributeStackChanged = hasStateAttributeStack && attributeStack.changed;

            if ( !stateSetAttributePair && !hasStateAttributeStackChanged ) continue;

            var stateSetAttribute = stateSetAttributePair ? stateSetAttributePair.getAttribute() : undefined;

            if ( !hasStateAttributeStack ) {

                attributeStack = this._createAttributeStack( _attributeArray, attributeId, stateSetAttribute.cloneType() );
                attributeStack.changed = true;
                this._applyAttributeStack( stateSetAttribute, attributeStack );

            } else if ( stateSetAttribute ) {

                var maskValue = stateSetAttributePair.getValue();
                attribute = this._evaluateOverrideObjectOnStack( attributeStack, stateSetAttribute, maskValue );
                if ( attribute !== stateSetAttribute ) { // override

                    if ( attributeStack.changed ) {
                        this._applyAttributeStack( attribute, attributeStack );
                        attributeStack.changed = false;
                    }

                } else if ( this._applyAttributeStack( attribute, attributeStack ) ) {

                    attributeStack.changed = true;

                }

            } else if ( attributeStack.values.length ) {

                attributeStack.changed = false;
                this._applyAttributeStack( attributeStack.back.object, attributeStack );

            } else {

                attributeStack.changed = false;
                this._applyAttributeStack( attributeStack.globalDefault, attributeStack );
            }


        }

    },

    _applyTextureAttributeMapListStateSet: function ( _textureAttributesArrayList, stateSetTextureAttributeArrayList ) {

        var gl = this._graphicContext;
        var _textureAttributeArray;

        var stateSetTextureAttributeLength, stateTextureAttributeLength;

        // very interesting JIT optimizer behavior
        // max texture is supposed to be the max of activeTexture or stateSet texture list
        // if the loop is fix, for example max value that could be 16. It's faster than using the max of textureUnit of State and StateSet even if the value is 8 for example
        var maxTexture = 16;
        for ( var i = 0, l = maxTexture; i < l; i++ ) {

            var textureUnit = i;

            _textureAttributeArray = _textureAttributesArrayList[ textureUnit ];
            var stateSetTextureAttributeArray = stateSetTextureAttributeArrayList[ textureUnit ];

            if ( !_textureAttributeArray && !stateSetTextureAttributeArray ) continue;

            stateSetTextureAttributeLength = stateTextureAttributeLength = 0;

            if ( !_textureAttributeArray ) {

                _textureAttributeArray = this.getOrCreateTextureAttributeArray( textureUnit );
                stateSetTextureAttributeLength = stateSetTextureAttributeArray.length;

            } else {

                stateTextureAttributeLength = _textureAttributeArray.length;
                if ( stateSetTextureAttributeArray ) stateSetTextureAttributeLength = stateSetTextureAttributeArray.length;
            }

            var lt = stateTextureAttributeLength > stateSetTextureAttributeLength ? stateTextureAttributeLength : stateSetTextureAttributeLength;
            for ( var j = 0; j < lt; j++ ) {
                var attributeId = j;
                var attributeStack = _textureAttributeArray[ attributeId ];
                var stateSetAttributePair = stateSetTextureAttributeArray ? stateSetTextureAttributeArray[ attributeId ] : undefined;
                var hasStateAttributeStack = attributeStack !== undefined;
                var hasStateAttributeStackChanged = hasStateAttributeStack && attributeStack.changed;
                var attribute;

                if ( !stateSetAttributePair && !hasStateAttributeStackChanged ) continue;

                var stateSetAttribute = stateSetAttributePair ? stateSetAttributePair.getAttribute() : undefined;

                if ( !hasStateAttributeStack ) {
                    attribute = stateSetAttributePair.getAttribute();
                    attributeStack = this._createAttributeStack( _textureAttributeArray, attributeId, attribute.cloneType() );
                    attributeStack.changed = true;
                    this._applyTextureAttribute( textureUnit, attribute, attributeStack );

                } else if ( stateSetAttribute ) {

                    var maskValue = stateSetAttributePair.getValue();
                    attribute = this._evaluateOverrideObjectOnStack( attributeStack, stateSetAttribute, maskValue );
                    if ( attribute !== stateSetAttribute ) { // override

                        if ( attributeStack.changed ) {
                            this._applyTextureAttribute( textureUnit, attribute, attributeStack );
                            attributeStack.changed = false;
                        }

                    } else if ( this._applyTextureAttribute( textureUnit, attribute, attributeStack ) ) {

                        attributeStack.changed = true;

                    }

                } else if ( attributeStack.values.length ) {

                    attributeStack.changed = false;
                    this._applyTextureAttribute( textureUnit, attributeStack.back.object, attributeStack );

                } else {

                    attributeStack.changed = false;
                    this._applyTextureAttribute( textureUnit, attributeStack.globalDefault, attributeStack );

                }
            }
        }
    },

    applyStateSet: function ( stateset ) {
        this._numApply++;

        var previousProgram = this.getLastProgramApplied();

        // needed before calling applyAttributeMap because
        // we cache needed StateAttribute from the compiler
        this._currentShaderGenerator = this.getCurrentShaderGeneratorStateSet( stateset );

        this._applyAttributeMapStateSet( this._attributeArray, stateset._attributeArray );
        this._applyTextureAttributeMapListStateSet( this.textureAttributeArrayList, stateset._textureAttributeArrayList );

        var lastApplied;
        var generatedProgram;
        if ( this._currentShaderGenerator ) {
            // no custom program look into the stack of ShaderGenerator name
            // what we should use to generate a program
            generatedProgram = this._currentShaderGenerator.getOrCreateProgram( this );
            this.applyAttribute( generatedProgram );
            lastApplied = generatedProgram;

            // will cache uniform and apply them with the program
            this._applyGeneratedProgramUniforms( generatedProgram, stateset );

        } else {
            lastApplied = this.getLastProgramApplied();
            // custom program so we will iterate on uniform from the program and apply them
            // but in order to be able to use Attribute in the state graph we will check if
            // our program want them. It must be defined by the user
            this._applyCustomProgramUniforms( lastApplied, stateset );
        }

        // reset reference of last applied matrix
        if ( previousProgram !== lastApplied ) {
            this._modelViewMatrix = undefined;
            this._projectionMatrix = undefined;
        }

    },

    popAllStateSets: function () {
        while ( this.stateSets.values.length ) {
            this.popStateSet();
        }
    },

    popStateSet: function () {

        if ( this.stateSets.isEmpty() ) return;

        var stateset = this.stateSets.pop();


        this.popAttributeMap( this._attributeArray, stateset._attributeArray, stateset._activeAttribute );

        var textureAttributeArrayList = stateset._textureAttributeArrayList;
        var activeTextureUnits = stateset._activeTextureAttributeUnit;
        var activeTextureAttribute = stateset._activeTextureAttribute;

        for ( var i = 0, l = activeTextureUnits.length; i < l; i++ ) {
            var unit = activeTextureUnits[ i ];
            var _attributeArray = textureAttributeArrayList[ unit ];

            var textureUnitAttributeArray = this.getOrCreateTextureAttributeArray( unit );
            this.popAttributeMap( textureUnitAttributeArray, _attributeArray, activeTextureAttribute );
        }

        if ( stateset.uniforms.getKeys().length ) this.popUniformsList( this.uniforms, stateset.uniforms );

        if ( stateset.getShaderGeneratorPair() ) {
            this._shaderGeneratorNames.pop();
        }
    },

    _createAttributeStack: function ( _attributeArray, index, globalDefault ) {

        var attributeStack = new Stack();
        attributeStack.globalDefault = globalDefault;

        _attributeArray[ index ] = attributeStack;

        return attributeStack;

    },

    haveAppliedAttribute: function ( attribute ) {

        var index = MACROUTILS.getOrCreateStateAttributeTypeMemberIndex( attribute );
        var attributeStack = this._attributeArray[ index ];
        if ( !attributeStack ) {
            attributeStack = this._createAttributeStack( this._attributeArray, index, attribute.cloneType() );
        }
        attributeStack.lastApplied = attribute;
        attributeStack.changed = true;

    },

    applyAttribute: function ( attribute ) {

        var index = MACROUTILS.getOrCreateStateAttributeTypeMemberIndex( attribute );

        var _attributeArray = this._attributeArray;
        var attributeStack = _attributeArray[ index ];
        if ( !attributeStack ) attributeStack = this._createAttributeStack( _attributeArray, index, attribute.cloneType() );

        attributeStack.changed = this._applyAttributeStack( attribute, attributeStack );
    },

    _applyAttributeStack: function ( attribute, attributeStack ) {
        if ( attributeStack.lastApplied === attribute ) return false;

        if ( attribute.apply ) attribute.apply( this );

        attributeStack.lastApplied = attribute;
        return true;

    },

    _applyTextureAttribute: function ( unit, attribute, attributeStack ) {

        if ( attributeStack.lastApplied === attribute ) return false;

        attributeStack.lastApplied = attribute;

        if ( !attribute.apply ) return true;

        var gl = this.getGraphicContext();
        gl.activeTexture( gl.TEXTURE0 + unit );

        // there is a texture we bind it.
        attribute.apply( this, unit );

        return true;
    },

    applyTextureAttribute: function ( unit, attribute ) {

        var index = MACROUTILS.getOrCreateTextureStateAttributeTypeMemberIndex( attribute );
        var textureUnitAttributeArray = this.getOrCreateTextureAttributeArray( unit );
        var attributeStack = textureUnitAttributeArray[ index ];

        if ( !attributeStack ) attributeStack = this._createAttributeStack( textureUnitAttributeArray, index, attribute.cloneType() );

        attributeStack.changed = true;
        this._applyTextureAttribute( unit, attribute, attributeStack );

    },

    getLastProgramApplied: function () {
        return this._programAttribute.lastApplied;
    },

    applyDefault: function () {
        // reset GL State To Default
        // we skip the textures/uniforms/shaders call since they are not necessary

        // noticed that we accumulate lot of stack, maybe because of the stateGraph
        // CP: ^^ really ? check it / report an issue
        this.popAllStateSets();

        this._currentShaderGenerator = undefined;

        this.applyAttributeMap( this._attributeArray );
        this.applyTextureAttributeMapList( this.textureAttributeArrayList );
    },

    apply: function () {
        this._numApply++;

        var previousProgram = this.getLastProgramApplied();

        // needed before calling applyAttributeMap because
        // we cache needed StateAttribute from the compiler
        this._currentShaderGenerator = this.getCurrentShaderGenerator();

        this.applyAttributeMap( this._attributeArray );
        this.applyTextureAttributeMapList( this.textureAttributeArrayList );

        var lastApplied;
        var generatedProgram;
        if ( this._currentShaderGenerator ) {
            // no custom program look into the stack of ShaderGenerator name
            // what we should use to generate a program
            generatedProgram = this._currentShaderGenerator.getOrCreateProgram( this );
            this.applyAttribute( generatedProgram );
            lastApplied = generatedProgram;

            // will cache uniform and apply them with the program
            this._applyGeneratedProgramUniforms( generatedProgram );

        } else {
            lastApplied = this.getLastProgramApplied();
            // custom program so we will iterate on uniform from the program and apply them
            // but in order to be able to use Attribute in the state graph we will check if
            // our program want them. It must be defined by the user
            this._applyCustomProgramUniforms( lastApplied );
        }

        // reset reference of last applied matrix
        if ( previousProgram !== lastApplied ) {
            this._modelViewMatrix = undefined;
            this._projectionMatrix = undefined;
        }
    },


    applyAttributeMap: function ( _attributeArray ) {

        this.lastAppliedAttributeLength = 0;
        var attributeStack;
        var validAttributeType = this._currentShaderGenerator ? this._currentShaderGenerator.getShaderCompiler().validAttributeTypeCache : undefined;
        var bitfield = 0;
        for ( var i = 0, l = _attributeArray.length; i < l; i++ ) {

            attributeStack = _attributeArray[ i ];
            if ( !attributeStack ) continue;

            var attribute;
            if ( attributeStack.values.length ) attribute = attributeStack.back.object;
            else attribute = attributeStack.globalDefault;

            // need to get the current attribute to check the type
            if ( validAttributeType &&
                validAttributeType[ attribute.attributeTypeId ] &&
                !this._currentShaderGenerator.filterAttributeTypes( attribute ) ) {
                this.lastAppliedAttribute[ this.lastAppliedAttributeLength++ ] = attribute;
            }

            if ( !attributeStack.changed ) continue;

            if ( attributeStack.lastApplied !== attribute ) {

                if ( attribute.apply )
                    attribute.apply( this );

                attributeStack.lastApplied = attribute;

            }

            attributeStack.changed = false;
        }
    },

    getObjectPair: (function() {
        return function ( object, value ) {
            return { value: value,
                     object: object };
        };
    })(),


    pushUniformsList: function ( uniformMap, stateSetUniformMap ) {
        /*jshint bitwise: false */
        var name;
        var uniform;

        var stateSetUniformMapKeys = stateSetUniformMap.getKeys();

        for ( var i = 0, l = stateSetUniformMapKeys.length; i < l; i++ ) {
            var key = stateSetUniformMapKeys[ i ];
            var uniformPair = stateSetUniformMap[ key ];
            uniform = uniformPair.getUniform();
            name = uniform.getName();
            if ( !uniformMap[ name ] ) {
                this._createAttributeStack( uniformMap, name, uniform );
            }

            this.pushCheckOverride( uniformMap[ name ], uniform, uniformPair.getValue() );
        }
        /*jshint bitwise: true */
    },

    popUniformsList: function ( uniformMap, stateSetUniformMap ) {

        var stateSetUniformMapKeys = stateSetUniformMap.getKeys();

        for ( var i = 0, l = stateSetUniformMapKeys.length; i < l; i++ ) {
            var key = stateSetUniformMapKeys[ i ];
            uniformMap[ key ].pop();
        }
    },

    applyTextureAttributeMapList: function ( textureAttributesArrayList ) {

        this.lastAppliedTextureAttributeLength = 0;

        var gl = this._graphicContext;
        var textureAttributeArray;
        var validAttributeType = this._currentShaderGenerator ? this._currentShaderGenerator.getShaderCompiler().validAttributeTypeCache : undefined;

        for ( var textureUnit = 0, l = textureAttributesArrayList.length; textureUnit < l; textureUnit++ ) {
            textureAttributeArray = textureAttributesArrayList[ textureUnit ];
            if ( !textureAttributeArray ) continue;

            for ( var i = 0, lt = textureAttributeArray.length; i < lt; i++ ) {

                var attributeStack = textureAttributeArray[ i ];

                // skip if not stack or not changed in stack
                if ( !attributeStack ) continue;

                var attribute;
                if ( attributeStack.values.length ) attribute = attributeStack.back.object;
                else attribute = attributeStack.globalDefault;

                // need to get the current attribute to check the type
                if ( validAttributeType && ( !attribute.isTextureNull || !attribute.isTextureNull() ) &&

                    validAttributeType[ attribute.attributeTypeId ] &&
                    !this._currentShaderGenerator.filterAttributeTypes( attribute ) ) {
                    this.lastAppliedTextureAttribute[ this.lastAppliedTextureAttributeLength++ ] = attribute;
                }

                if ( !attributeStack.changed ) continue;

                // if the the stack has changed but the last applied attribute is the same
                // then we dont need to apply it again
                if ( attributeStack.lastApplied !== attribute ) {

                    gl.activeTexture( gl.TEXTURE0 + textureUnit );
                    attribute.apply( this, textureUnit );

                    attributeStack.lastApplied = attribute;
                }

                attributeStack.changed = false;

            }
        }
    },

    setGlobalDefaultAttribute: function ( attribute ) {
        var _attributeArray = this._attributeArray;
        var index = MACROUTILS.getOrCreateStateAttributeTypeMemberIndex( attribute );
        if ( _attributeArray[ index ] === undefined ) {
            this._createAttributeStack( _attributeArray, index, attribute );
        } else {
            _attributeArray[ index ].globalDefault = attribute;
        }

    },

    getGlobalDefaultAttribute: function ( typeMember ) {
        var _attributeArray = this._attributeArray;
        var index = MACROUTILS.getIdFromTypeMember( typeMember );
        if ( index === undefined ) return undefined;
        return ( _attributeArray[ index ] ? _attributeArray[ index ].globalDefault : undefined );
    },

    setGlobalDefaultTextureAttribute: function ( unit, attribute ) {
        var _attributeArray = this.getOrCreateTextureAttributeArray( unit );
        var index = MACROUTILS.getOrCreateTextureStateAttributeTypeMemberIndex( attribute );

        if ( _attributeArray[ index ] === undefined ) {
            this._createAttributeStack( _attributeArray, index, attribute );
        } else {
            _attributeArray[ index ].globalDefault = attribute;
        }

    },

    getGlobalDefaultTextureAttribute: function ( unit, typeMember ) {
        var _attributeArray = this.getOrCreateTextureAttributeArray( unit );
        var index = MACROUTILS.getTextureIdFromTypeMember( typeMember );
        if ( index === undefined ) return undefined;
        return ( _attributeArray[ index ] ? _attributeArray[ index ].globalDefault : undefined );
    },

    getOrCreateTextureAttributeArray: function ( unit ) {
        if ( !this.textureAttributeArrayList[ unit ] ) this.textureAttributeArrayList[ unit ] = [];
        return this.textureAttributeArrayList[ unit ];
    },

    pushAttributeMap: function ( _attributeArray, stateSetAttributeArray, validAttributeArray ) {
        /*jshint bitwise: false */
        var attributeStack;

        for ( var i = 0, l = validAttributeArray.length; i < l; i++ ) {

            var index = validAttributeArray[ i ];
            var attributePair = stateSetAttributeArray[ index ];
            var attribute = attributePair.getAttribute();

            attributeStack = _attributeArray[ index ];
            if ( !attributeStack ) {
                this._createAttributeStack( _attributeArray, index, attribute.cloneType() );
                attributeStack = _attributeArray[ index ];
            }

            this.pushCheckOverride( attributeStack, attribute, attributePair.getValue() );
            attributeStack.changed = true;
        }
        /*jshint bitwise: true */
    },

    popAttributeMap: function ( _attributeArray, stateSetAttributeArray, activeAttribute ) {

        for ( var i = 0, l = activeAttribute.length; i < l; i++ ) {

            var index = activeAttribute[ i ];
            var attributeStack = _attributeArray[ index ];
            attributeStack.pop();
            attributeStack.changed = true;

        }

    },

    setIndexArray: function ( array ) {

        var gl = this._graphicContext;

        if ( this._currentIndexVBO !== array ) {
            array.bind( gl );
            this._currentIndexVBO = array;
        }

        if ( array.isDirty() ) {
            array.compile( gl );
        }

    },

    lazyDisablingOfVertexAttributes: function () {
        var keys = this.vertexAttribMap._keys;
        for ( var i = 0, l = keys.length; i < l; i++ ) {
            var attr = keys[ i ];
            if ( this.vertexAttribMap[ attr ] ) {
                this.vertexAttribMap._disable[ attr ] = true;
            }
        }
    },

    enableVertexColor: function () {

        var program = this._programAttribute.lastApplied;

        if ( !program.getUniformsCache().uArrayColorEnabled ||
            !program.getAttributesCache().Color ) return; // no color uniform or attribute used, exit

        // update uniform
        var uniform = this.uniforms.ArrayColorEnabled.globalDefault;

        var previousColorEnabled = this._previousColorAttribPair[ program.getInstanceID() ];

        if ( !previousColorEnabled ) {
            uniform.setFloat( 1.0 );
            uniform.apply( this.getGraphicContext(), program.getUniformsCache().uArrayColorEnabled );
            this._previousColorAttribPair[ program.getInstanceID() ] = true;
        }

    },


    disableVertexColor: function () {

        var program = this._programAttribute.lastApplied;

        if ( !program.getUniformsCache().uArrayColorEnabled ||
            !program.getAttributesCache().Color ) return; // no color uniform or attribute used, exit

        // update uniform
        var uniform = this.uniforms.ArrayColorEnabled.globalDefault;

        var previousColorEnabled = this._previousColorAttribPair[ program.getInstanceID() ];

        if ( previousColorEnabled ) {
            uniform.setFloat( 0.0 );
            uniform.apply( this.getGraphicContext(), program.getUniformsCache().uArrayColorEnabled );
            this._previousColorAttribPair[ program.getInstanceID() ] = false;
        }

    },


    applyDisablingOfVertexAttributes: function () {

        var keys = this.vertexAttribMap._keys;
        for ( var i = 0, l = keys.length; i < l; i++ ) {
            if ( this.vertexAttribMap._disable[ keys[ i ] ] === true ) {
                var attr = keys[ i ];
                this._graphicContext.disableVertexAttribArray( attr );
                this.vertexAttribMap._disable[ attr ] = false;
                this.vertexAttribMap[ attr ] = false;
            }
        }
    },

    clearVertexAttribCache: function () {

        var vertexAttribMap = this.vertexAttribMap;
        var keys = vertexAttribMap._keys;
        for ( var i = 0, l = keys.length; i < l; i++ ) {
            var attr = keys[ i ];
            vertexAttribMap[ attr ] = undefined;
            vertexAttribMap._disable[ attr ] = false;
        }

        this.vertexAttribMap._disable.length = 0;
        this.vertexAttribMap._keys.length = 0;

    },

    /**
     *  set a vertex array object.
     *  return true if binded the vao and false
     *  if was already binded
     */
    setVertexArrayObject: function ( vao ) {

        if ( this._currentVAO !== vao ) {

            this._extVAO.bindVertexArrayOES( vao );
            this._currentVAO = vao;

            // disable cache to force a re enable of array
            if ( !vao ) this.clearVertexAttribCache();

            // disable currentIndexVBO to force to bind indexArray from Geometry
            // if there is a change of vao
            this._currentIndexVBO = undefined;

            return true;
        }
        return false;
    },

    setVertexAttribArray: function ( attrib, array, normalize ) {

        var vertexAttribMap = this.vertexAttribMap;
        vertexAttribMap._disable[ attrib ] = false;
        var gl = this._graphicContext;
        var binded = false;

        if ( array.isDirty() ) {
            array.bind( gl );
            array.compile( gl );
            binded = true;
        }

        var currentArray = vertexAttribMap[ attrib ];
        if ( currentArray !== array ) {

            if ( !binded ) {
                array.bind( gl );
            }

            if ( !currentArray ) {
                gl.enableVertexAttribArray( attrib );

                // can be === false (so undefined check is important)
                if ( currentArray === undefined )
                    vertexAttribMap._keys.push( attrib );

            }

            vertexAttribMap[ attrib ] = array;
            gl.vertexAttribPointer( attrib, array.getItemSize(), array.getType(), normalize, 0, 0 );
        }
    },


    _getActiveUniformsFromProgramAttributes: function ( program, activeUniformsList ) {

        var _attributeArrayStack = this._attributeArray;

        var attributeKeys = program.getTrackAttributes().attributeKeys;

        if ( attributeKeys.length > 0 ) {

            for ( var i = 0, l = attributeKeys.length; i < l; i++ ) {

                var key = attributeKeys[ i ];
                var index = this.typeMember[ key ];
                var attributeStack = _attributeArrayStack[ index ];
                if ( attributeStack === undefined ) {
                    continue;
                }

                // we just need the uniform list and not the attribute itself
                var attribute = attributeStack.globalDefault;
                if ( attribute.getOrCreateUniforms === undefined ) {
                    continue;
                }

                var uniformMap = attribute.getOrCreateUniforms();
                var uniformKeys = uniformMap.getKeys();

                for ( var a = 0, b = uniformKeys.length; a < b; a++ ) {
                    activeUniformsList.push( uniformMap[ uniformKeys[ a ] ] );
                }
            }

        }
    },

    _getActiveUniformsFromProgramTextureAttributes: function ( program, activeUniformsList ) {

        var textureAttributeKeysList = program.getTrackAttributes().textureAttributeKeys;
        if ( textureAttributeKeysList === undefined ) return;

        for ( var unit = 0, nbUnit = textureAttributeKeysList.length; unit < nbUnit; unit++ ) {

            var textureAttributeKeys = textureAttributeKeysList[ unit ];
            if ( textureAttributeKeys === undefined ) continue;

            var unitTextureAttributeList = this.textureAttributeArrayList[ unit ];
            if ( unitTextureAttributeList === undefined ) continue;

            for ( var i = 0, l = textureAttributeKeys.length; i < l; i++ ) {
                var key = textureAttributeKeys[ i ];

                var attributeStack = unitTextureAttributeList[ key ];
                if ( attributeStack === undefined ) {
                    continue;
                }
                // we just need the uniform list and not the attribute itself
                var attribute = attributeStack.globalDefault;
                if ( attribute.getOrCreateUniforms === undefined ) {
                    continue;
                }
                var uniformMap = attribute.getOrCreateUniforms();
                var uniformMapKeys = uniformMap.getKeys();

                for ( var a = 0, b = uniformMapKeys.length; a < b; a++ ) {
                    activeUniformsList.push( uniformMap[ uniformMapKeys[ a ] ] );
                }
            }
        }
    },

    _cacheUniformsForCustomProgram: function ( program, activeUniformsList ) {

        this._getActiveUniformsFromProgramAttributes( program, activeUniformsList );

        this._getActiveUniformsFromProgramTextureAttributes( program, activeUniformsList );

        var gl = this._graphicContext;

        // now we have a list on uniforms we want to track but we will filter them to use only what is needed by our program
        // not that if you create a uniforms whith the same name of a tracked attribute, and it will override it
        var uniformsFinal = new Map();

        for ( var i = 0, l = activeUniformsList.length; i < l; i++ ) {
            var u = activeUniformsList[ i ];
            var uniformName = u.getName();
            var loc = gl.getUniformLocation( program._program, uniformName );
            if ( loc !== undefined && loc !== null ) {
                uniformsFinal[ uniformName ] = u;
            }
        }
        uniformsFinal.dirty();
        program.trackUniforms = uniformsFinal;

    },

    _applyCustomProgramUniforms: ( function ( ) {

        var activeUniformsList = [];

        return function ( program,  stateset ) {

            // custom program so we will iterate on uniform from the program and apply them
            // but in order to be able to use Attribute in the state graph we will check if
            // our program want them. It must be defined by the user

            // first time we see attributes key, so we will keep a list of uniforms from attributes
            activeUniformsList.length = 0;

            // fill the program with cached active uniforms map from attributes and texture attributes
            if ( program.getTrackAttributes() !== undefined && program.trackUniforms === undefined ) {
                this._cacheUniformsForCustomProgram( program, activeUniformsList );
            }

            var programUniformMap = program.getUniformsCache();
            var programUniformKeys = programUniformMap.getKeys();
            var uniformMapStack = this.uniforms;

            var programTrackUniformMap;
            if ( program.trackUniforms ) programTrackUniformMap = program.trackUniforms;

            var uniform;
            for ( var i = 0, l = programUniformKeys.length; i < l; i++ ) {
                var name = programUniformKeys[ i ];
                var location = programUniformMap[ name ];
                var uniformStack = uniformMapStack[ name ];

                var hasStateSetUniformPair = stateset && stateset.uniforms[ name ];

                if ( !uniformStack && !hasStateSetUniformPair ) {

                    if ( programTrackUniformMap === undefined ) continue;

                    uniform = programTrackUniformMap[ name ];

                } else if ( hasStateSetUniformPair ) {

                    var stateSetUniformPair = stateset.uniforms[ name ];
                    var maskValue = stateSetUniformPair.getValue();
                    var stateSetUniform = stateSetUniformPair.getUniform();
                    if ( uniformStack )
                        uniform = this._evaluateOverrideObjectOnStack( uniformStack, stateSetUniform, maskValue );
                    else
                        uniform = stateSetUniform;

                } else if ( uniformStack.values.length ) {

                    uniform = uniformStack.back.object;

                } else {

                    uniform = uniformStack.globalDefault;

                }

                uniform.apply( this._graphicContext, location );

            }
        };
    } )(),

    getCurrentShaderGenerator: function () {

        var programStack = this._programAttribute;

        if ( programStack !== undefined && programStack.values.length !== 0 && programStack.back.value !== StateAttribute.OFF )
            return undefined;

        // no custom program look into the stack of ShaderGenerator name
        // what we should use to generate a program
        var last = this._shaderGeneratorNames.back;
        var shaderGenerator = this._shaderGeneratorProxy.getShaderGenerator( last ? last.object : undefined );
        return shaderGenerator;
    },

    _computeForeignUniforms: function ( programUniformMap, activeUniformMap ) {

        var uniformMapKeys = programUniformMap.getKeys();
        var uniformMap = programUniformMap;

        var foreignUniforms = [];
        for ( var i = 0, l = uniformMapKeys.length; i < l; i++ ) {

            var name = uniformMapKeys[ i ];
            var location = uniformMap[ name ];

            if ( location !== undefined && activeUniformMap[ name ] === undefined ) {

                // filter 'standard' uniform matrix that will be applied for all shader
                if ( name !== this.modelViewMatrix.getName() &&
                    name !== this.modelMatrix.getName() &&
                    name !== this.viewMatrix.getName() &&
                    name !== this.projectionMatrix.getName() &&
                    name !== this.modelViewNormalMatrix.getName() &&
                    name !== 'uArrayColorEnabled' ) {
                    foreignUniforms.push( name );
                }
            }

        }

        return foreignUniforms;
    },

    _removeUniformsNotRequiredByProgram: function ( activeUniformMap, programUniformMap ) {

        var activeUniformMapKeys = activeUniformMap.getKeys();

        for ( var i = 0, l = activeUniformMapKeys.length; i < l; i++ ) {
            var name = activeUniformMapKeys[ i ];
            var location = programUniformMap[ name ];
            if ( location === undefined || location === null ) {
                delete activeUniformMap[ name ];
                activeUniformMap.dirty();
            }
        }
    },


    _cacheUniformsForGeneratedProgram: function ( program ) {

        var foreignUniforms = this._computeForeignUniforms( program.getUniformsCache(), program.getActiveUniforms() );
        program.setForeignUniforms( foreignUniforms );


        // remove uniforms listed by attributes (getActiveUniforms) but not required by the program
        this._removeUniformsNotRequiredByProgram( program.getActiveUniforms(), program.getUniformsCache() );

    },

    _copyUniformEntry: function ( uniform ) {

        var internalArray = uniform.getInternalArray();
        var cacheData;
        if ( internalArray.length < 16 )
            cacheData = new internalArray.constructor( internalArray.length );

        return cacheData;
    },

    _initUniformCache: function ( program ) {

        var activeUniformMap = program.getActiveUniforms();
        var activeUniformKeys = activeUniformMap.getKeys();

        var foreignUniformKeys = program.getForeignUniforms();
        var uniformMapStack = this.uniforms;

        var cacheForeignUniforms = [];
        var cacheActiveUniforms = [];

        var i, l, cache, name, cacheData, uniform;

        program._cacheUniformId = this._cacheUniformId++;
        this._programUniformCache[ program._cacheUniformId ] = {};

        if ( foreignUniformKeys.length ) {
            cache = cacheForeignUniforms;
            for ( i = 0, l = foreignUniformKeys.length; i < l; i++ ) {
                name = foreignUniformKeys[ i ];
                var uniStack = uniformMapStack[ name ];
                if ( uniStack ) {
                    uniform = uniStack.globalDefault;
                    cacheData = this._copyUniformEntry( uniform );
                    cache.push( cacheData );
                }

            }
        }

        if ( activeUniformKeys.length ) {
            cache = cacheActiveUniforms;
            for ( i = 0, l = activeUniformKeys.length; i < l; i++ ) {
                name = activeUniformKeys[ i ];
                uniform = activeUniformMap[ name ];
                cacheData = this._copyUniformEntry( uniform );
                cache.push( cacheData );
            }
        }

        this._programUniformCache[ program._cacheUniformId ].foreign = cacheForeignUniforms;
        this._programUniformCache[ program._cacheUniformId ].active = cacheActiveUniforms;

    },

    _checkCacheAndApplyUniform: function ( uniform, cacheArray, i, programUniformMap, name ) {
        var isCached;
        var internalArray = uniform.getInternalArray();
        var uniformArrayLength = internalArray.length;
        if ( uniformArrayLength <= 4 ) {
            var uniformCache = cacheArray[ i ];
            isCached = checkUniformCache[ uniformArrayLength ]( internalArray, uniformCache );
        } else {
            isCached = false;
        }

        if ( !isCached ) {
            var location = programUniformMap[ name ];
            uniform.apply( this._graphicContext, location );
        }
    },

    // note that about TextureAttribute that need uniform on unit we would need to improve
    // the current uniformList ...

    // when we apply the shader for the first time, we want to compute the active uniforms for this shader and the list of uniforms not extracted from attributes called foreignUniforms
    _applyGeneratedProgramUniforms: function ( program, stateset ) {

        var foreignUniformKeys = program.getForeignUniforms();
        if ( !foreignUniformKeys ) {
            this._cacheUniformsForGeneratedProgram( program );
            foreignUniformKeys = program.getForeignUniforms();

            this._initUniformCache( program );
        }

        var programUniformMap = program.getUniformsCache();
        var activeUniformMap = program.getActiveUniforms();

        var cacheUniformsActive = this._programUniformCache[ program._cacheUniformId ].active;
        var cacheUniformsForeign = this._programUniformCache[ program._cacheUniformId ].foreign;

        // apply active uniforms
        // caching uniforms from attribtues make it impossible to overwrite uniform with a custom uniform instance not used in the attributes
        var i, l, name, uniform;
        var activeUniformKeys = activeUniformMap.getKeys();

        for ( i = 0, l = activeUniformKeys.length; i < l; i++ ) {

            name = activeUniformKeys[ i ];
            uniform = activeUniformMap[ name ];

            this._checkCacheAndApplyUniform( uniform, cacheUniformsActive, i, programUniformMap, name );
        }

        var uniformMapStack = this.uniforms;

        // apply now foreign uniforms, it's uniforms needed by the program but not contains in attributes used to generate this program
        for ( i = 0, l = foreignUniformKeys.length; i < l; i++ ) {
            name = foreignUniformKeys[ i ];

            var uniformStack = uniformMapStack[ name ];
            var hasStateSetUniformPair = stateset && stateset.uniforms[ name ];

            if ( !hasStateSetUniformPair && !uniformStack ) continue;

            if ( !uniformStack ) {

                uniform = stateSetUniform.getUniform();
                this._createAttributeStack( uniformMapStack, name, uniform );

            } else if ( hasStateSetUniformPair ) {

                var stateSetUniformPair = stateset.uniforms[ name ];
                var maskValue = stateSetUniformPair.getValue();
                var stateSetUniform = stateSetUniformPair.getUniform();
                uniform = this._evaluateOverrideObjectOnStack( uniformStack, stateSetUniform, maskValue );

            } else if ( uniformStack.values.length ) {

                uniform = uniformStack.back.object;

            } else {

                uniform = uniformStack.globalDefault;
            }

            this._checkCacheAndApplyUniform( uniform, cacheUniformsForeign, i, programUniformMap, name );

        }
    },

    // Use to detect changes in RenderLeaf between call to avoid to applyStateSet
    _setStateSetsDrawID: function ( id ) {
        var values = this.stateSets.values;
        for ( var i = 0, nbStateSets = values.length; i < nbStateSets; i++ ) {
            values[ i ].setDrawID( id );
        }
    },

    _stateSetStackChanged: function ( id, nbLast ) {
        var values = this.stateSets.values;
        var nbStateSets = values.length;
        if ( nbLast !== nbStateSets )
            return true;

        for ( var i = 0; i < nbStateSets; i++ ) {
            if ( id !== values[ i ].getDrawID() )
                return true;
        }

        return false;
    }


} ), 'osg', 'State' );

module.exports = State;
