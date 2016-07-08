'use strict';

var applyFunctions = [];

var registerApplyNodeType = function ( type, apply ) {
    applyFunctions[ type ] = apply;
};

var getApplyNodeType = function ( type ) {
    return applyFunctions[ type ];
};


module.exports = {
    applyFunctions: applyFunctions,
    registerApplyNodeType: registerApplyNodeType,
    getApplyNodeType: getApplyNodeType
};
