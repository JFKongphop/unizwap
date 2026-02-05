// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {TokenA} from "../src/tokens/TokenA.sol";
import {TokenB} from "../src/tokens/TokenB.sol";

contract TokensDeployer is Script {
  function run() external {
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerPrivateKey);

    console.log("Deployer address:", deployer);
    console.log("Deployer balance:", deployer.balance);

    vm.startBroadcast(deployerPrivateKey);

    // Deploy TokenA
    TokenA tokenA = new TokenA();
    console.log("TokenA deployed at:", address(tokenA));
    console.log("TokenA name:", tokenA.name());
    console.log("TokenA symbol:", tokenA.symbol());
    console.log("TokenA deployer balance:", tokenA.balanceOf(deployer));

    // Deploy TokenB
    TokenB tokenB = new TokenB();
    console.log("TokenB deployed at:", address(tokenB));
    console.log("TokenB name:", tokenB.name());
    console.log("TokenB symbol:", tokenB.symbol());
    console.log("TokenB deployer balance:", tokenB.balanceOf(deployer));

    vm.stopBroadcast();

    console.log("\n=== Deployment Summary ===");
    console.log("TokenA:", address(tokenA));
    console.log("TokenB:", address(tokenB));
    console.log("========================\n");
  }
}
