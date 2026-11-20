// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockDDSC} from "../src/MockDDSC.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";

contract Deploy is Script {
    function run() external {
        require(block.chainid == 99999 || block.chainid == 80002, "Deploy: testnets only");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        MockDDSC token = new MockDDSC();
        PaymentRouter router = new PaymentRouter(deployer, deployer);
        SubscriptionManager subscriptions = new SubscriptionManager(deployer, deployer);
        router.setSupportedToken(address(token), true);
        subscriptions.setSupportedToken(address(token), true);
        token.mint(deployer, 1_000_000_00);
        vm.stopBroadcast();
        console2.log("CHAIN_ID", block.chainid);
        console2.log("DEPLOYER", deployer);
        console2.log("MOCK_DDSC", address(token));
        console2.log("PAYMENT_ROUTER", address(router));
        console2.log("SUBSCRIPTION_MANAGER", address(subscriptions));
    }
}
