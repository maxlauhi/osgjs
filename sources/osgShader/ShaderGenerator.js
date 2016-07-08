'use strict';
var MACROUTILS = require( 'osg/Utils' );
var Notify = require( 'osg/notify' );
var Program = require( 'osg/Program' );
var Shader = require( 'osg/Shader' );
var Map = require( 'osg/Map' );
var Compiler = require( 'osgShader/Compiler' );
var ShaderProcessor = require( 'osgShader/ShaderProcessor' );

var ShaderGenerator = function () {
    this._cache = {};

    // ShaderProcessor singleton used by ShaderGenerator
    // but user can replace it if needed
    this._shaderProcessor = new ShaderProcessor();

    // ShaderCompiler Object to instanciate
    this._ShaderCompiler = undefined;

    this.setShaderCompiler( Compiler );
};

ShaderGenerator.prototype = {

    // setShaderCompiler that will be used to createShader
    setShaderCompiler: function ( ShaderCompiler ) {
        this._ShaderCompiler = ShaderCompiler;
        if ( !ShaderCompiler.validAttributeTypeMemberCache ) this._computeStateAttributeCache( ShaderCompiler );
    },

    getShaderCompiler: function () {
        return this._ShaderCompiler;
    },


    getShaderProcessor: function () {
        return this._shaderProcessor;
    },

    setShaderProcessor: function ( shaderProcessor ) {
        this._shaderProcessor = shaderProcessor;
    },

    // filter input types and write the result in the outputs array
    filterAttributeTypes: function ( attribute ) {

        // TODO: use same mechanism as acceptAttributesTypes ?
        // with a default set in a var and use overwrittable Set
        // when inheriting the class
        // Faster && Flexiblier
        var libName = attribute.libraryName();
        if ( libName !== 'osg' && libName !== 'osgShadow' && libName !== 'osgAnimation' )
            return true;

        // works for attribute that contains isEnabled
        // Light, Shadow. It let us to filter them to build a shader if not enabled
        if ( attribute.isEnabled && !attribute.isEnabled() ) return true;

        return false;
    },

    // get actives attribute that comes from state
    getActiveAttributeList: function ( state, list ) {

        var hash = '';
        var _attributeArray = state._attributeArray;
        var cacheType = this._ShaderCompiler.validAttributeTypeMemberCache;

        for ( var j = 0, k = cacheType.length; j < k; j++ ) {
            var type = cacheType[ j ];
            var attributeStack = _attributeArray[ type ];
            if ( !attributeStack ) continue;
            var attr = attributeStack.lastApplied;

            if ( !attr || this.filterAttributeTypes( attr ) )
                continue;

            hash = hash + attr.getHash();
            list.push( attr );
        }

        return hash;
    },


    // get actives attribute that comes from state
    getActiveAttributeListCache: function ( state ) {

        var hash = '';

        var cacheType = this._ShaderCompiler.validAttributeTypeMemberCache;
        for ( var i = 0, l = cacheType.length; i < l; i++ ) {
            var type = cacheType[i];
            var attributeStack = state._attributeArray[type];
            if ( attributeStack && attributeStack.lastApplied ) hash += attributeStack.lastApplied.getHash();
        }

        return hash;
    },


    // get actives texture attribute that comes from state
    getActiveTextureAttributeListCache: function ( state ) {

        var hash = '';

        var cacheType = this._ShaderCompiler.validTextureAttributeTypeMemberCache;
        var textureUnitList = state.textureAttributeArrayList;
        for ( var j = 0; j < textureUnitList.length; j++ ) {
            var textureUnit = textureUnitList[ j ];
            if ( !textureUnit ) continue;

            for ( var i = 0; i < cacheType.length; i++ ) {
                var type = cacheType[ i ];
                var attributeStack = textureUnit[ type ];
                if ( attributeStack && attributeStack.lastApplied ) {
                    var lastApplied = attributeStack.lastApplied;

                    // we check to filter texture null in hash
                    // but it's probably better to just set the hash correctly of a tetxure null
                    if ( lastApplied.isTextureNull && lastApplied.isTextureNull() ) continue;

                    hash += lastApplied.getHash();
                }
            }
        }

        return hash;
    },


    // get actives texture attribute that comes from state
    getActiveTextureAttributeList: function ( state, list ) {
        var hash = '';
        var _attributeArrayList = state.textureAttributeArrayList;
        var i, l;
        var cacheType = this._ShaderCompiler.validTextureAttributeTypeMemberCache;

        for ( i = 0, l = _attributeArrayList.length; i < l; i++ ) {
            var _attributeArrayForUnit = _attributeArrayList[ i ];

            if ( !_attributeArrayForUnit ) continue;

            list[ i ] = [];

            for ( var j = 0, m = cacheType.length; j < m; j++ ) {
                var type = cacheType[ j ];

                var attributeStack = _attributeArrayForUnit[ type ];
                if ( !attributeStack ) continue;

                var attr = attributeStack.lastApplied;
                if ( !attr || this.filterAttributeTypes( attr ) )
                    continue;

                if ( attr.isTextureNull() )
                    continue;

                hash += attr.getHash();
                list[ i ].push( attr );
            }
        }
        return hash;
    },

    getActiveUniforms: function ( state, attributeList, textureAttributeList ) {

        var uniforms = {};

        for ( var i = 0, l = attributeList.length; i < l; i++ ) {

            var at = attributeList[ i ];
            if ( at.getOrCreateUniforms ) {
                var attributeUniformMap = at.getOrCreateUniforms();
                // It could happen that uniforms are declared conditionally
                if ( attributeUniformMap !== undefined ) {
                    var attributeUniformMapKeys = attributeUniformMap.getKeys();

                    for ( var j = 0, m = attributeUniformMapKeys.length; j < m; j++ ) {
                        var name = attributeUniformMapKeys[ j ];
                        var uniform = attributeUniformMap[ name ];
                        uniforms[ uniform.getName() ] = uniform;
                    }
                }
            }
        }

        for ( var a = 0, n = textureAttributeList.length; a < n; a++ ) {
            var tat = textureAttributeList[ a ];
            if ( tat ) {
                for ( var b = 0, o = tat.length; b < o; b++ ) {
                    var attr = tat[ b ];

                    var texUniformMap = attr.getOrCreateUniforms( a );
                    var texUniformMapKeys = texUniformMap.getKeys();

                    for ( var t = 0, tl = texUniformMapKeys.length; t < tl; t++ ) {
                        var tname = texUniformMapKeys[ t ];
                        var tuniform = texUniformMap[ tname ];
                        uniforms[ tuniform.getName() ] = tuniform;
                    }
                }
            }
        }

        return new Map( uniforms );
    },

    _computeStateAttributeCache: function ( CompilerShader ) {

        var typeMemberNames = CompilerShader.validAttributeTypeMember || [];
        var validTypeMemberList = [];
        var i, il, cache;
        var id;
        for ( i = 0, il = typeMemberNames.length; i < il; i++ ) {
            id = MACROUTILS.getIdFromTypeMember( typeMemberNames[ i ] );
            if ( id !== undefined ) validTypeMemberList.push( id );
        }
        cache = new Uint8Array( validTypeMemberList );
        CompilerShader.validAttributeTypeMemberCache = cache;

        typeMemberNames = CompilerShader.validTextureAttributeTypeMember || [];
        validTypeMemberList = [];
        for ( i = 0, il = typeMemberNames.length; i < il; i++ ) {
            id = MACROUTILS.getTextureIdFromTypeMember( typeMemberNames[ i ] );
            if ( id !== undefined ) validTypeMemberList.push( id );
        }
        cache = new Uint8Array( validTypeMemberList );
        CompilerShader.validTextureAttributeTypeMemberCache = cache;

    },

    getOrCreateProgram: ( function () {
        // TODO: double check GC impact of this stack
        // TODO: find a way to get a hash dirty/cache on stateAttribute
        var textureAttributes = [];
        var attributes = [];

        return function ( state ) {
            // extract valid attributes

            // use ShaderCompiler, it can be overrided by a custom one
            var ShaderCompiler = this._ShaderCompiler;

            var hash = this.getActiveAttributeListCache( state ) + this.getActiveTextureAttributeListCache( state );

            var cache = this._cache[ hash ];
            if ( cache !== undefined ) return cache;

            // slow path to generate shader
            attributes.length = 0;
            textureAttributes.length = 0;

            this.getActiveAttributeList( state, attributes );
            this.getActiveTextureAttributeList( state, textureAttributes );

            var shaderGen = new ShaderCompiler( attributes, textureAttributes, this._shaderProcessor );

            /* develblock:start */
            // Logs hash, attributes and compiler
            Notify.debug( 'New Compilation ', false, true );
            Notify.debug( {
                Attributes: attributes,
                Texture: textureAttributes,
                Hash: hash,
                Compiler: shaderGen.getFragmentShaderName()
            }, false, true );
            /* develblock:end */

            var fragmentshader = shaderGen.createFragmentShader();
            var vertexshader = shaderGen.createVertexShader();

            var program = new Program(
                new Shader( Shader.VERTEX_SHADER, vertexshader ),
                new Shader( Shader.FRAGMENT_SHADER, fragmentshader ) );

            program.hash = hash;
            program.setActiveUniforms( this.getActiveUniforms( state, attributes, textureAttributes ) );
            program.generated = true;

            this._cache[ hash ] = program;
            return program;
        };
    } )()
};

module.exports = ShaderGenerator;
