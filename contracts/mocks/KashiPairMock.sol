// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../bentobox/KashiPairMediumRiskV1.sol";



// File contracts/interfaces/IOracle.sol
// License-Identifier: MIT


contract KashiPairMock is KashiPairMediumRiskV1 {
    constructor(IBentoBoxV1 bentoBox) public KashiPairMediumRiskV1(bentoBox) {
        return;
    }

    function accrueTwice() public {
        accrue();
        accrue();
    }
}
