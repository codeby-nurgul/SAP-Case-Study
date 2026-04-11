sap.ui.define(function () {
	"use strict";

	return {
		name: "QUnit test suite for the UI5 Application: test",
		defaults: {
			page: "ui5://test-resources/test/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: {
				version: 2
			},
			sinon: {
				version: 1
			},
			ui5: {
				language: "EN",
				theme: "sap_horizon"
			},
			coverage: {
				only: "test/",
				never: "test-resources/test/"
			},
			loader: {
				paths: {
					"test": "../"
				}
			}
		},
		tests: {
			"unit/unitTests": {
				title: "Unit tests for test"
			},
			"integration/opaTests": {
				title: "Integration tests for test"
			}
		}
	};
});
