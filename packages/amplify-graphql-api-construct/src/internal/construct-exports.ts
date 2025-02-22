import { Construct } from 'constructs';
import {
  CfnGraphQLApi,
  CfnGraphQLSchema,
  CfnApiKey,
  CfnResolver,
  CfnFunctionConfiguration,
  CfnDataSource,
  GraphqlApi,
} from 'aws-cdk-lib/aws-appsync';
import { CfnTable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { CfnRole, Role } from 'aws-cdk-lib/aws-iam';
import { CfnResource, NestedStack } from 'aws-cdk-lib';
import { getResourceName } from '@aws-amplify/graphql-transformer-core';
import { CfnFunction, Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { AmplifyGraphqlApiResources, FunctionSlot } from '../types';

/**
 * Everything below here is intended to help us gather the
 * output values and render out the L1 resources for access.
 *
 * This is done by recursing along the construct tree, and classifying the generated resources.
 *
 * @param scope root to search for generated resource against
 * @returns a mapping of L1 and L2 constructs generated by the Graphql Transformer.
 */
export const getGeneratedResources = (scope: Construct): AmplifyGraphqlApiResources => {
  let cfnGraphqlApi: CfnGraphQLApi | undefined;
  let cfnGraphqlSchema: CfnGraphQLSchema | undefined;
  let cfnApiKey: CfnApiKey | undefined;
  const cfnResolvers: Record<string, CfnResolver> = {};
  const cfnFunctionConfigurations: Record<string, CfnFunctionConfiguration> = {};
  const cfnDataSources: Record<string, CfnDataSource> = {};
  const tables: Record<string, Table> = {};
  const cfnTables: Record<string, CfnTable> = {};
  const roles: Record<string, Role> = {};
  const cfnRoles: Record<string, CfnRole> = {};
  const functions: Record<string, LambdaFunction> = {};
  const cfnFunctions: Record<string, CfnFunction> = {};
  const additionalCfnResources: Record<string, CfnResource> = {};

  const classifyConstruct = (currentScope: Construct): void => {
    if (currentScope instanceof CfnGraphQLApi) {
      cfnGraphqlApi = currentScope;
      return;
    }
    if (currentScope instanceof CfnGraphQLSchema) {
      cfnGraphqlSchema = currentScope;
      return;
    }
    if (currentScope instanceof CfnApiKey) {
      cfnApiKey = currentScope;
      return;
    }

    // Retrieve reference name for indexed resources, and bail if none is found.
    const resourceName = getResourceName(currentScope);
    if (!resourceName) return;

    if (currentScope instanceof CfnDataSource) {
      cfnDataSources[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnResolver) {
      cfnResolvers[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnFunctionConfiguration) {
      cfnFunctionConfigurations[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof Table) {
      tables[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnTable) {
      cfnTables[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof Role) {
      roles[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnRole) {
      cfnRoles[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof LambdaFunction) {
      functions[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnFunction) {
      cfnFunctions[resourceName] = currentScope;
      return;
    }
    if (currentScope instanceof CfnResource) {
      additionalCfnResources[resourceName] = currentScope;
      return;
    }
  };

  const walkAndClassifyConstructTree = (currentScope: Construct): void => {
    classifyConstruct(currentScope);
    currentScope.node.children.forEach(walkAndClassifyConstructTree);
  };

  scope.node.children.forEach(walkAndClassifyConstructTree);

  if (!cfnGraphqlApi) {
    throw new Error('Expected to find AWS::AppSync::GraphQLApi in the generated resource scope.');
  }

  if (!cfnGraphqlSchema) {
    throw new Error('Expected to find AWS::AppSync::GraphQLSchema in the generated resource scope.');
  }

  const nestedStacks: Record<string, NestedStack> = Object.fromEntries(
    scope.node.children.filter(NestedStack.isNestedStack).map((nestedStack: NestedStack) => [nestedStack.node.id, nestedStack]),
  );

  return {
    graphqlApi: GraphqlApi.fromGraphqlApiAttributes(scope, 'L2GraphqlApi', { graphqlApiId: cfnGraphqlApi.attrApiId }),
    tables,
    roles,
    functions,
    nestedStacks,
    cfnResources: {
      cfnGraphqlApi,
      cfnGraphqlSchema,
      cfnApiKey,
      cfnResolvers,
      cfnFunctionConfigurations,
      cfnDataSources,
      cfnTables,
      cfnRoles,
      cfnFunctions,
      additionalCfnResources,
    },
  };
};

/**
 * Get the function slots generated by the Graphql transform operation, adhering to the FunctionSlot interface.
 * @param generatedResolvers the resolvers generated by the transformer to spit back out.
 * @returns the list of generated function slots in the transformer, in order to facilitate overrides.
 */
export const getGeneratedFunctionSlots = (generatedResolvers: Record<string, string>): FunctionSlot[] =>
  Object.entries(generatedResolvers)
    .filter(([name]) => name.split('.').length === 6)
    .map(([name, resolverCode]) => {
      const [typeName, fieldName, slotName, slotIndex, templateType] = name.split('.');
      return {
        typeName,
        fieldName,
        slotName,
        slotIndex: Number.parseInt(slotIndex, 10),
        function: {
          // TODO: this should consolidate req/req values back together
          ...(templateType === 'req' ? { requestMappingTemplate: resolverCode } : {}),
          ...(templateType === 'res' ? { responseMappingTemplate: resolverCode } : {}),
        },
      } as FunctionSlot;
    });
