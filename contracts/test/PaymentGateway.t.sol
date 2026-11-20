// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockDDSC} from "../src/MockDDSC.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";

contract PaymentGatewayTest is Test {
    MockDDSC token;
    PaymentRouter router;
    SubscriptionManager subs;
    address merchant = address(0xBEEF);
    address customer = address(0xCAFE);
    address treasury = address(0xD00D);

    function setUp() public {
        token = new MockDDSC();
        router = new PaymentRouter(address(this), treasury);
        subs = new SubscriptionManager(address(this), treasury);
        router.setSupportedToken(address(token), true);
        subs.setSupportedToken(address(token), true);
        token.mint(customer, 100_000);
        vm.prank(customer); token.approve(address(router), type(uint256).max);
        vm.prank(customer); token.approve(address(subs), type(uint256).max);
    }

    function testPaymentSplitsMerchantAndFee() public {
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        assertEq(token.balanceOf(merchant), 9_970);
        assertEq(token.balanceOf(treasury), 30);
    }

    function testCannotPayTwice() public {
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        vm.prank(customer); vm.expectRevert("PaymentRouter: not payable"); router.pay(id, token);
    }

    function testExpiredIntentCannotBePaid() public {
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(customer); vm.expectRevert("PaymentRouter: intent expired"); router.pay(id, token);
    }

    function testFeeCannotExceedFivePercent() public {
        vm.expectRevert("PaymentRouter: fee too high"); router.setFee(501);
    }

    function testSubscriptionChargeAndCancel() public {
        vm.warp(100 days);
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 30 days, 3_000, 5_000);
        vm.warp(130 days);
        vm.prank(merchant); subs.charge(id);
        assertEq(token.balanceOf(merchant), 997);
        vm.prank(customer); subs.cancel(id);
        assertEq(token.balanceOf(customer), 99_000);
    }

    function testOnlyCustomerCanPause() public {
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 1 days, 2_000, 2_000);
        vm.prank(merchant); vm.expectRevert("SubscriptionManager: customer only"); subs.pause(id);
    }

    function testOnlyOwnerCanConfigureRouter() public {
        vm.prank(customer);
        vm.expectRevert();
        router.setSupportedToken(address(token), true);
        vm.prank(customer);
        vm.expectRevert();
        router.setFee(100);
        vm.prank(customer);
        vm.expectRevert();
        router.setTreasury(customer);
        // owner can configure
        router.setSupportedToken(address(token), true);
        router.setFee(100);
        assertEq(router.feeBps(), 100);
    }

    function testOnlyOwnerCanRefund() public {
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        vm.prank(merchant);
        vm.expectRevert();
        router.refund(id, token);
    }

    function testRefundFlowMakesCustomerWholeMerchantKeepsPrincipal() public {
        token.mint(address(this), 10_000);
        vm.prank(address(this)); token.approve(address(router), type(uint256).max);
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        uint256 merchantBefore = token.balanceOf(merchant);
        vm.prank(address(this)); router.refund(id, token);
        assertEq(token.balanceOf(merchant), merchantBefore, "merchant must keep principal");
        assertEq(token.balanceOf(customer), 100_000, "customer must be made whole");
        assertEq(uint256(router.getPayment(id).status), uint256(3), "status must be Refunded");
    }

    function testRefundAlreadyRefundedReverts() public {
        token.mint(address(this), 10_000);
        vm.prank(address(this)); token.approve(address(router), type(uint256).max);
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        vm.prank(address(this)); router.refund(id, token);
        vm.prank(address(this));
        vm.expectRevert("PaymentRouter: not refundable");
        router.refund(id, token);
    }

    function testRefundUnpaidReverts() public {
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(address(this));
        vm.expectRevert("PaymentRouter: not refundable");
        router.refund(id, token);
    }

    function testRefundAfterWindowReverts() public {
        token.mint(address(this), 10_000);
        vm.prank(address(this)); token.approve(address(router), type(uint256).max);
        bytes32 id = router.createIntent(merchant, 10_000, token);
        vm.prank(customer); router.pay(id, token);
        vm.warp(block.timestamp + 30 days + 1);
        vm.prank(address(this));
        vm.expectRevert("PaymentRouter: refund window closed");
        router.refund(id, token);
    }

    function testCreateIntentRejectsUnsupportedToken() public {
        MockDDSC other = new MockDDSC();
        vm.expectRevert("PaymentRouter: unsupported token");
        router.createIntent(merchant, 10_000, other);
    }

    function testSubscriptionChargeCannotExceedEscrow() public {
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 30 days, 1_000, 1_000);
        vm.warp(30 days + 1);
        vm.prank(merchant); subs.charge(id);
        assertEq(token.balanceOf(merchant), 997);
        (, , , , uint128 subBal, , , ) = subs.subscriptions(id);
        assertEq(uint256(subBal), uint256(0));
        // escrow exhausted: advance to next due date, charge must revert
        vm.warp(30 days + 1);
        vm.prank(merchant);
        vm.expectRevert();
        subs.charge(id);
    }

    function testSubscriptionChargeByNonMerchantReverts() public {
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 30 days, 3_000, 5_000);
        vm.warp(30 days + 1);
        vm.prank(customer);
        vm.expectRevert("SubscriptionManager: merchant only");
        subs.charge(id);
    }

    function testSubscriptionTopUpByNonCustomerReverts() public {
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 30 days, 3_000, 5_000);
        vm.prank(merchant);
        vm.expectRevert("SubscriptionManager: customer only");
        subs.topUp(id, 1_000);
    }

    function testSubscriptionCancelRefundsRemainingBalance() public {
        vm.prank(customer);
        bytes32 id = subs.createSubscription(merchant, token, 1_000, 30 days, 3_000, 5_000);
        uint256 customerBefore = token.balanceOf(customer);
        vm.warp(30 days + 1);
        vm.prank(merchant); subs.charge(id);
        // balance 3000 - 1000 = 2000 remains in escrow
        (, , , , uint128 subBal, , , ) = subs.subscriptions(id);
        assertEq(uint256(subBal), uint256(2_000));
        vm.prank(customer); subs.cancel(id);
        assertEq(token.balanceOf(customer), customerBefore + 2_000);
        (, , , , uint128 subBalAfter, , , ) = subs.subscriptions(id);
        assertEq(uint256(subBalAfter), uint256(0));
    }

    function testMockDDSCMintZeroAddressReverts() public {
        vm.expectRevert("MockDDSC: zero recipient");
        token.mint(address(0), 100);
    }
}
