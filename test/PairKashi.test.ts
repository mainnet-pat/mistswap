import { ethers } from "hardhat";
import { assert, expect } from "chai";
import {
    ADDRESS_ZERO,
    advanceBlock,
    advanceTime,
    advanceTimeAndBlock,
    getBigNumber,
    sansBorrowFee,
    sansSafetyAmount,
    setMasterContractApproval,
} from "./utilities";
import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { defaultAbiCoder } from "ethers/lib/utils";
import KashiPair from "./utilities/kashipair";

let accounts: SignerWithAddress[] | any;

let alice, bob, carol, fred: SignerWithAddress;
let alicePrivateKey, bobPrivateKey: string;


//WETH
let WETHToken: ContractFactory;
let wethToken: Contract;

//Fake ERC20 Tokens
let ReturnFalseERC20Mock,RevertingERC20Mock : ContractFactory;
let tokenA, tokenB: Contract;
const amountA = 50000
const amountB = 50000

//BentoBox
let BentoBox: ContractFactory;
let bentoBox: Contract;

//SushiSwapPair
let SushiSwapPair, SushiSwapFactory: ContractFactory;
let sushiSwapPair, sushiSwapFactory: Contract;

//UniswapV2Factory
let UniswapV2Factory: ContractFactory;
let uniswapV2Factory: Contract;

//SimpleStrategy
let SimpleStrategy: ContractFactory;
let simpleStrategy: Contract;

//ERC20
let ERC20Token: ContractFactory;
let erc20Token: Contract;

//ERC20
let KashiPairFactory: ContractFactory;
let kashiPairContract: Contract;


//Oracle
let Oracle: ContractFactory;
let oracle: Contract;

//SushiSwapSwapper
let SushiSwapSwapper: ContractFactory;
let sushiSwapSwapper: Contract;

//ExternalFunction
let ExternalFunction : ContractFactory;
let externalFunction: Contract;

let pairHelper;

let pair;


describe("KashiPair Basic", function () {

    beforeEach(async function () {
        // Setup accounts
        accounts = await ethers.getSigners();
        alice = accounts[0];
        bob = accounts[1];
        carol = accounts[2];
        fred = accounts[5]

        alicePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        bobPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
        
        //Deploy WETH9
        WETHToken = await ethers.getContractFactory("WETH9Mock");
        wethToken = await WETHToken.deploy();
        await wethToken.deployed();


        //Deploy BentoBox
        BentoBox = await ethers.getContractFactory("BentoBoxMock");
        bentoBox = await BentoBox.deploy(wethToken.address);
        await bentoBox.deployed();

        //Deploy FakeTokens
        ReturnFalseERC20Mock = await ethers.getContractFactory("ReturnFalseERC20Mock");
        RevertingERC20Mock = await ethers.getContractFactory("RevertingERC20Mock");
        tokenA = await ReturnFalseERC20Mock.deploy("Token A", "A", 18, getBigNumber(1000000, 18));
        tokenB = await RevertingERC20Mock.deploy("Token B", "B", 8, getBigNumber(1000000, 8));
        await tokenA.deployed();
        await tokenB.deployed();

        //Funding Bob Address
        await tokenA.transfer(bob.address, getBigNumber(1000, 18))
        await tokenB.transfer(bob.address, getBigNumber(1000, 8))
        //Funding Carol Address
        await tokenA.transfer(carol.address, getBigNumber(1000, 18))
        await tokenB.transfer(carol.address, getBigNumber(1000, 8))
        //Funding Fred Address
        await tokenA.transfer(fred.address, getBigNumber(1000, 18))
        await tokenB.transfer(fred.address, getBigNumber(1000, 8))

        //Deploy UniswapV2Factory
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        uniswapV2Factory = await UniswapV2Factory.deploy(alice.address);
        //Creating Pair
        const createPairTx = await uniswapV2Factory.createPair(tokenA.address, tokenB.address)
        pair = (await createPairTx.wait()).events[0].args.pair

        //Deploy SushiSwapFactory
        SushiSwapFactory = await ethers.getContractFactory("SushiSwapFactoryMock");
        sushiSwapFactory = await SushiSwapFactory.deploy(alice.address)
        await sushiSwapFactory.deployed();

        //Attach Pair to SushiSwapPair
        SushiSwapPair = await ethers.getContractFactory("SushiSwapPairMock");
        sushiSwapPair = await SushiSwapPair.attach(pair)
        
        //Adding Amount to Fake Tokens
        await tokenA.transfer(sushiSwapPair.address, getBigNumber(amountA, await tokenA.decimals()))
        await tokenB.transfer(sushiSwapPair.address, getBigNumber(amountB, await tokenB.decimals()))
        
        //Mint SushiSwapPair
        await sushiSwapPair.mint(alice.address)



        //-----------------------END OF FIRST PART------------------------------



        //-----------------------START OF SECOND PART------------------------------

        //Deploy SimpleStrategy
        SimpleStrategy = await ethers.getContractFactory("SimpleStrategyMock");
        simpleStrategy = await SimpleStrategy.deploy(alice.address, tokenA.address)
        await simpleStrategy.deployed();

        //Set Strategy
        await bentoBox.setStrategy(tokenA.address, simpleStrategy.address)
        await advanceTime(1209600)
        await bentoBox.setStrategy(tokenA.address, simpleStrategy.address)
        await bentoBox.setStrategyTargetPercentage(tokenA.address, 20)

        //Deploy ERC20
        ERC20Token = await ethers.getContractFactory("ERC20Mock");
        erc20Token = await ERC20Token.deploy("erc20", "ERC20Mock", 10000000)
        await erc20Token.deployed();

        //Deploy KashiPair
        KashiPairFactory = await ethers.getContractFactory("KashiPairMock");
        kashiPairContract = await KashiPairFactory.deploy(bentoBox.address)
        await kashiPairContract.deployed();

        //Deploy Oracle
        Oracle = await ethers.getContractFactory("OracleMock");
        oracle = await Oracle.deploy()
        await oracle.deployed();

        //Deploy SushiSwapSwapper
        SushiSwapSwapper = await ethers.getContractFactory("SushiSwapSwapper");
        sushiSwapSwapper = await SushiSwapSwapper.deploy(bentoBox.address, uniswapV2Factory.address, await uniswapV2Factory.pairCodeHash())
        await sushiSwapSwapper.deployed();

        //Setting up swapper, fees and oracle
        await kashiPairContract.setSwapper(sushiSwapSwapper.address, true)
        await kashiPairContract.setFeeTo(alice.address)
        await oracle.set(getBigNumber(1,28))

       //-----------------------END OF SECOND PART------------------------------
        
        
        
        //-----------------------START OF THIRD PART------------------------------

        //AddKashiPair
        const oracleData = await oracle.getDataParameter()
        pairHelper = await KashiPair.deploy(bentoBox, kashiPairContract, KashiPairFactory, tokenA, tokenB, oracle, oracleData)


         // Two different ways to approve the kashiPair
         await setMasterContractApproval(bentoBox, alice, alice, alicePrivateKey, kashiPairContract.address, true)
        await setMasterContractApproval(bentoBox, bob, bob, bobPrivateKey, kashiPairContract.address, true)
        
        
        
        await tokenA.connect(fred).approve(bentoBox.address, getBigNumber(130))
        await expect(bentoBox.connect(fred)
             .deposit(tokenA.address, fred.address, fred.address, getBigNumber(100), 0))
             .to.emit(tokenA, "Transfer")
             .withArgs(fred.address, bentoBox.address, getBigNumber(100))
             .to.emit(bentoBox, "LogDeposit")
             .withArgs(tokenA.address, fred.address, fred.address, getBigNumber(100), getBigNumber(100))

         await bentoBox.connect(fred).addProfit(tokenA.address, getBigNumber(30))

         await tokenB.connect(fred).approve(bentoBox.address, getBigNumber(400, 8))
         await expect(bentoBox.connect(fred).deposit(tokenB.address, fred.address, fred.address, getBigNumber(200, 8), 0))
             .to.emit(tokenB, "Transfer")
             .withArgs(fred.address, bentoBox.address, getBigNumber(200, 8))
             .to.emit(bentoBox, "LogDeposit")
             .withArgs(tokenB.address, fred.address, fred.address, getBigNumber(200, 8), getBigNumber(200, 8))

         await bentoBox.connect(fred).addProfit(tokenB.address, getBigNumber(200, 8))
       
    })
    describe("Deployment", function () {
        it("Assigns a name", async function () {
            expect(await pairHelper.contract.name()).to.be.equal("Kashi Medium Risk Token A/Token B-Test")
        })
        it("Assigns a symbol", async function () {
            expect(await pairHelper.contract.symbol()).to.be.equal("kmA/B-TEST")
        })

        it("Assigns decimals", async function () {
            expect(await pairHelper.contract.decimals()).to.be.equal(8)
        })

        it("totalSupply is reachable", async function () {
            expect(await pairHelper.contract.totalSupply()).to.be.equal(0)
        })
    })

    describe("Init", function () {
        it("Reverts init for collateral address 0", async function () {
            const oracleDataTest = await oracle.getDataParameter()
            const newPairHelper = KashiPair.deploy(bentoBox, kashiPairContract, KashiPairFactory, ADDRESS_ZERO, tokenB, oracle, oracleDataTest)
            await expect(newPairHelper).to.be.revertedWith("KashiPair: bad pair")
        })

        it("Reverts init for initilised pair", async function () {
            await expect(pairHelper.contract.init(pairHelper.initData)).to.be.revertedWith("KashiPair: already initialized")
        })
    })

    describe("Permit", function () {
        it("should allow permit", async function () {
            const nonce = await tokenA.nonces(alice.address)
            const deadline = (await alice.provider._internalBlockNumber).respTime + 10000
            await pairHelper.tokenPermit(tokenA, alice, alicePrivateKey, 1, nonce, deadline)
        })
    })

    describe("Accrue", function () {
        it("should take else path if accrue is called within same block", async function () {
            await pairHelper.contract.accrueTwice()
        })

        it("should update the interest rate according to utilization", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(800)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(oracle.set, "1100000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])

            let borrowPartLeft = await pairHelper.contract.userBorrowPart(alice.address)
            let collateralLeft = await pairHelper.contract.userCollateralShare(alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft.sub(getBigNumber(1, 6)))])
            borrowPartLeft = await pairHelper.contract.userBorrowPart(alice.address)

            // run for a while with 0 utilization
            let rate1 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            for (let i = 0; i < 20; i++) {
                await advanceBlock()
            }
            await pairHelper.contract.accrue()

            // check results
            let rate2 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            assert(rate2.lt(rate1), "rate has not adjusted down with low utilization")

            // then increase utilization to 90%
            await pairHelper.run((cmd) => [
                cmd.depositCollateral(getBigNumber(400)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(270, 8))),
            ])

            // and run a while again
            rate1 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            for (let i = 0; i < 20; i++) {
                await advanceBlock()
            }

            // check results
            await pairHelper.contract.accrue()
            rate2 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            expect(rate2).to.be.gt(rate1)
        })

        it("should reset interest rate if no more assets are available", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(200)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(alice.address)
            let balanceLeft = await pairHelper.contract.balanceOf(alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft), cmd.do(pairHelper.contract.accrue)])
            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(317097920)
        })

        it("should lock interest rate at minimum", async function () {
            let totalBorrowBefore = (await pairHelper.contract.totalBorrow()).amount
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(200)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, 1),
                cmd.do(pairHelper.contract.accrue),
            ])
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()

            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(79274480)
        })

        it("should lock interest rate at maximum", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(300)),
                cmd.depositCollateral(getBigNumber(300)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(100, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(1500000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(1500000)
            await pairHelper.contract.accrue()

            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(317097920000)
        })

        it("should emit Accrue if on target utilization", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
            ])
            await expect(pairHelper.contract.accrue()).to.emit(pairHelper.contract, "LogAccrue")
        })
    })

    describe("Is Solvent", function () {
        //
    })

    describe("Update Exchange Rate", async function () {
        it("should update exchange rate", async function () {
            const ACTION_UPDATE_EXCHANGE_RATE = 11
            await pairHelper.contract.cook(
                [ACTION_UPDATE_EXCHANGE_RATE],
                [0],
                [defaultAbiCoder.encode(["bool", "uint256", "uint256"], [true, 0, 0])]
            )
        })
    })

    describe("Add Asset", function () {
        it("should add asset with skim", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(2, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, 0, getBigNumber(1, 8))
            await bentoBox.transfer(tokenB.address, alice.address, pairHelper.contract.address, getBigNumber(1, 8))
            await pairHelper.run((cmd) => [cmd.do(pairHelper.contract.addAsset, alice.address, true, getBigNumber(1, 8))])
            expect(await pairHelper.contract.balanceOf(alice.address)).to.be.equal(getBigNumber(1, 8))
        })

        it("should revert when trying to skim too much", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(2))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, 0, getBigNumber(1, 8))
            await bentoBox.transfer(tokenB.address, alice.address, pairHelper.contract.address, getBigNumber(1, 8))
            await expect(
                pairHelper.run((cmd) => [cmd.do(pairHelper.contract.addAsset, alice.address, true, getBigNumber(2, 8))])
            ).to.be.revertedWith("KashiPair: Skim too much")
        })

        it("should revert if MasterContract is not approved", async function () {
            await tokenB.connect(carol).approve(bentoBox.address, 300)
            await expect((await pairHelper.as(carol)).depositAsset(290)).to.be.revertedWith("BentoBox: Transfer not approved")
        })

        it("should take a deposit of assets from BentoBox", async function () {
            await pairHelper.run((cmd) => [cmd.approveAsset(3000), cmd.depositAsset(3000)])
            expect(await pairHelper.contract.balanceOf(alice.address)).to.be.equal(1500)
        })

        it("should emit correct event on adding asset", async function () {
            await tokenB.approve(bentoBox.address, 3000)
            await expect(pairHelper.depositAsset(2900))
                .to.emit(pairHelper.contract, "LogAddAsset")
                .withArgs(alice.address, alice.address, 1450, 1450)
        })
    })

    describe("Remove Asset", function () {
        it("should not allow a remove without assets", async function () {
            await expect(pairHelper.withdrawAsset(1)).to.be.reverted
        })

        it("should allow to remove assets", async function () {
            let bobHelper = await pairHelper.as(bob)
            await bobHelper.run((cmd) => [cmd.approveAsset(getBigNumber(200, 8)), cmd.depositAsset(getBigNumber(200, 8))])
            expect(await pairHelper.contract.balanceOf(bob.address)).to.be.equal(getBigNumber(100, 8))
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(200, 8)),
                cmd.depositAsset(getBigNumber(200, 8)),
                cmd.withdrawAsset(getBigNumber(100, 8)),
            ])
        })
    })

    describe("Add Collateral", function () {
        it("should take a deposit of collateral", async function () {
            await tokenA.approve(bentoBox.address, 300)
            await expect(pairHelper.depositCollateral(290))
                .to.emit(pairHelper.contract, "LogAddCollateral")
                .withArgs(alice.address, alice.address, 223)
        })
    })

    describe("Remove Collateral", function () {
        it("should not allow a remove without collateral", async function () {
            await expect(pairHelper.withdrawCollateral(alice.address, 1)).to.be.revertedWith("BoringMath: Underflow")
        })

        it("should allow a direct removal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.removeCollateral, alice.address, getBigNumber(50)),
            ])
            expect(await bentoBox.balanceOf(tokenA.address, alice.address)).to.be.equal(getBigNumber(50))
        })

        it("should not allow a remove of collateral if user is insolvent", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])

            await expect(pairHelper.withdrawCollateral(getBigNumber(1, 0))).to.be.revertedWith("KashiPair: user insolvent")
        })

        it("should allow to partial withdrawal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft), cmd.withdrawCollateral(getBigNumber(50))])
        })

        it("should allow to full withdrawal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(alice.address)
            await pairHelper.repay(borrowPartLeft)
            let collateralLeft = await pairHelper.contract.userCollateralShare(alice.address)
            await pairHelper.withdrawCollateral(sansSafetyAmount(collateralLeft))
        })
    })

    describe("Borrow", function () {
        it("should not allow borrowing without any assets", async function () {
            await expect(pairHelper.contract.borrow(alice.address, 10000)).to.be.revertedWith("Kashi: below minimum")
            await expect(pairHelper.contract.borrow(alice.address, 1)).to.be.revertedWith("Kashi: below minimum")
        })

        it("should not allow borrowing without any collateral", async function () {
            await tokenB.approve(bentoBox.address, 300)
            await await pairHelper.depositAsset(290)
            await expect(pairHelper.contract.borrow(alice.address, 1)).to.be.revertedWith("Kashi: below minimum")
        })

        it("should allow borrowing with collateral up to 75%", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(300, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await expect(pairHelper.contract.borrow(alice.address, sansBorrowFee(getBigNumber(75, 8))))
                .to.emit(pairHelper.contract, "LogBorrow")
                .withArgs(alice.address, alice.address, "7496251874", "3748125", "7499999999")
        })

        it("should allow borrowing to other with correct borrowPart", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(300, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await expect(pairHelper.contract.borrow(bob.address, sansBorrowFee(getBigNumber(75, 8))))
                .to.emit(pairHelper.contract, "LogBorrow")
                .withArgs(alice.address, bob.address, "7496251874", "3748125", "7499999999")
            expect(await pairHelper.contract.userBorrowPart(alice.address)).to.be.equal("7499999999")
            expect(await pairHelper.contract.userBorrowPart(bob.address)).to.be.equal("0")
        })

        it("should not allow any more borrowing", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await pairHelper.contract.borrow(alice.address, sansBorrowFee(getBigNumber(75, 8)))
            await expect(pairHelper.contract.borrow(alice.address, 1)).to.be.revertedWith("user insolvent")
        })

        /*it("should report insolvency due to interest", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            expect(await pairHelper.contract.isSolvent(alice.address, false)).to.be.false
        })*/
    })

    describe("Repay", function () {
        it("should allow to repay", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.repay(getBigNumber(30, 8)),
            ])
        })

        it("should allow to repay from BentoBox", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(bentoBox.deposit, tokenB.address, alice.address, alice.address, getBigNumber(70, 8), 0),
                cmd.do(pairHelper.contract.repay, alice.address, false, getBigNumber(50, 8)),
            ])
        })

        it("should allow full repayment", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
            ])

            let part = await pairHelper.contract.userBorrowPart(alice.address)

            await pairHelper.run((cmd) => [cmd.repay(part)])
        })
    })

    describe("Short", function () {
        it("should not allow shorting if it does not return enough", async function () {
            await expect(
                pairHelper.run((cmd) => [
                    cmd.as(bob).approveAsset(getBigNumber(1000, 8)),
                    cmd.as(bob).depositAsset(getBigNumber(1000, 8)),
                    cmd.approveCollateral(getBigNumber(100)),
                    cmd.depositCollateral(getBigNumber(100)),
                    cmd.short(sushiSwapSwapper, getBigNumber(200, 8), getBigNumber(200)),
                ])
            ).to.be.revertedWith("KashiPair: call failed")
        })

        it("should not allow shorting into insolvency", async function () {
            await expect(
                pairHelper.run((cmd) => [
                    // Bob adds 1000 asset (amount)
                    cmd.as(bob).approveAsset(getBigNumber(1000, 8)),
                    cmd.as(bob).depositAsset(getBigNumber(1000, 8)),
                    // Alice adds 100 collateral (amount)
                    cmd.approveCollateral(getBigNumber(100)),
                    cmd.depositCollateral(getBigNumber(100)),
                    // Alice shorts by borrowing 500 assets shares for at least 50 shares collateral
                    cmd.short(sushiSwapSwapper, getBigNumber(400, 8), getBigNumber(50)),
                ])
            ).to.be.revertedWith("KashiPair: user insolvent")
        })

        it("should allow shorting", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])
        })

        it("should limit asset availability after shorting", async function () {
            // Alice adds 1 asset
            // Bob adds 1000 asset
            // Alice adds 100 collateral
            // Alice borrows 250 asset and deposits 230+ collateral
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(1, 8)),
                cmd.depositAsset(getBigNumber(1, 8)), // Just a minimum balance for the BentoBox
                cmd.as(bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])

            const bobBal = await pairHelper.contract.balanceOf(bob.address)
            expect(bobBal).to.be.equal(getBigNumber(500, 8))
            // virtual balance of 1000 is higher than the contract has
            await expect(pairHelper.as(bob).withdrawAsset(bobBal)).to.be.revertedWith("BoringMath: Underflow")
            await expect(pairHelper.as(bob).withdrawAsset(getBigNumber(376, 8))).to.be.revertedWith("BoringMath: Underflow")
            await pairHelper.as(bob).withdrawAsset(getBigNumber(375, 8))
        })
    })

    describe("Unwind", function () {
        it("should allow unwinding the short", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])

            const collateralShare = await pairHelper.contract.userCollateralShare(alice.address)
            const borrowPart = await pairHelper.contract.userBorrowPart(alice.address)

            await pairHelper.run((cmd) => [cmd.unwind(sushiSwapSwapper, borrowPart, collateralShare)])
        })
    })

    describe("Cook", function () {
        it("can add 2 values to a call and receive 1 value back", async function () {
            const ACTION_BENTO_DEPOSIT = 20
            const ACTION_CALL = 30
            //Deploy ExternalFunction
            ExternalFunction = await ethers.getContractFactory("ExternalFunctionMock");
            externalFunction = await ExternalFunction.deploy();
            await externalFunction.deployed();
            let data = externalFunction.interface.encodeFunctionData("sum", [10, 10])

            await pairHelper.run((cmd) => [cmd.approveAsset(getBigNumber(100, 8))])

            await expect(
                pairHelper.contract.cook(
                    [ACTION_BENTO_DEPOSIT, ACTION_CALL, ACTION_BENTO_DEPOSIT],
                    [0, 0, 0],
                    [
                        defaultAbiCoder.encode(
                            ["address", "address", "int256", "int256"],
                            [tokenB.address, alice.address, getBigNumber(25, 8), 0]
                        ),
                        defaultAbiCoder.encode(
                            ["address", "bytes", "bool", "bool", "uint8"],
                            [externalFunction.address, data.slice(0, -128), true, true, 1]
                        ),
                        defaultAbiCoder.encode(["address", "address", "int256", "int256"], [tokenB.address, alice.address, -1, 0]),
                    ]
                )
            )
                .to.emit(externalFunction, "Result")
                .withArgs(getBigNumber(375, 7))

            // (25 / 2) + (37.5 / 2) = 31.25
            expect(await bentoBox.balanceOf(tokenB.address, alice.address)).to.be.equal("3125000000")
        })

        it("reverts on a call to the BentoBox", async function () {
            const ACTION_CALL = 30
            await expect(
                pairHelper.contract.cook(
                    [ACTION_CALL],
                    [0],
                    [defaultAbiCoder.encode(["address", "bytes", "bool", "bool", "uint8"], [bentoBox.address, "0x", false, false, 0])]
                )
            ).to.be.revertedWith("KashiPair: can't call")
        })

        it("takes else path", async function () {
            await expect(
                pairHelper.contract.cook(
                    [99],
                    [0],
                    [
                        defaultAbiCoder.encode(
                            ["address", "address", "int256", "int256"],
                            [tokenB.address, alice.address, getBigNumber(25), 0]
                        ),
                    ]
                )
            )
        })

        it("get repays part", async function () {
            const ACTION_GET_REPAY_PART = 7
            await pairHelper.contract.cook([ACTION_GET_REPAY_PART], [0], [defaultAbiCoder.encode(["int256"], [1])])
        })

        it("executed Bento transfer multiple", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(100, 8)),
                cmd.do(bentoBox.deposit, tokenB.address, alice.address, alice.address, getBigNumber(70, 8), 0),
            ])
            const ACTION_BENTO_TRANSFER_MULTIPLE = 23
            await pairHelper.contract.cook(
                [ACTION_BENTO_TRANSFER_MULTIPLE],
                [0],
                [defaultAbiCoder.encode(["address", "address[]", "uint256[]"], [tokenB.address, [carol.address], [getBigNumber(10, 8)]])]
            )
        })

        it("allows to addAsset with approval", async function () {
            const nonce = await bentoBox.nonces(alice.address)
            await expect(
                await pairHelper.run((cmd) => [
                    cmd.approveAsset(getBigNumber(100, 8)),
                    cmd.depositAssetWithApproval(getBigNumber(100, 8), kashiPairContract, alicePrivateKey, nonce),
                ])
            )
        })
    })

    describe("Liquidate", function () {
        it("should not allow open liquidate yet", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(bentoBox.connect(bob).deposit, tokenB.address, bob.address, bob.address, getBigNumber(20, 8), 0),
            ])

            await expect(
                pairHelper.contract
                    .connect(bob)
                    .liquidate([alice.address], [getBigNumber(20, 8)], bob.address, "0x0000000000000000000000000000000000000000", true)
            ).to.be.revertedWith("KashiPair: all are solvent")
        })

        it("should allow open liquidate", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.do(bentoBox.connect(bob).deposit, tokenB.address, bob.address, bob.address, getBigNumber(20, 8), 0),
                cmd.do(pairHelper.contract.connect(bob).removeAsset, bob.address, getBigNumber(50, 8)),
            ])
            await pairHelper.contract
                .connect(bob)
                .liquidate([alice.address], [getBigNumber(20, 8)], bob.address, "0x0000000000000000000000000000000000000000", true)
        })

        it("should allow open liquidate with swapper", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.do(bentoBox.connect(bob).deposit, tokenB.address, bob.address, bob.address, getBigNumber(20, 8), 0),
            ])
            await expect(
                pairHelper.contract
                    .connect(bob)
                    .liquidate([alice.address], [getBigNumber(20, 8)], sushiSwapSwapper.address, sushiSwapSwapper.address, true)
            )
                .to.emit(pairHelper.contract, "LogRemoveCollateral")
                .to.emit(pairHelper.contract, "LogRepay")
        })

        it("should allow closed liquidate", async function () {
            await pairHelper.run((cmd) => [
                // Bob adds 290 asset amount (145 shares)
                cmd.as(bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                // Alice adds 100 collateral amount (76 shares)
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                // Alice borrows 75 asset amount
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                // Change oracle to put Alice into insolvency
                cmd.do(oracle.set, "11000000000000000000000000000"),
                //cmd.do(tokenA.transfer, this.sushiSwapPair.address, getBigNumber(500)),
                //cmd.do(this.sushiSwapPair.sync),
                cmd.updateExchangeRate(),
            ])

            // Bob liquidates Alice for 20 asset parts (approx 20 asset amount = 10 asset shares)
            await pairHelper.contract
                .connect(bob)
                .liquidate([alice.address], [getBigNumber(20, 8)], sushiSwapSwapper.address, sushiSwapSwapper.address, false)
        })

        it("should not allow closed liquidate with invalid swapper", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(bob).approveAsset(getBigNumber(340, 8)),
                cmd.as(bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
            ])

            //Deploy SushiSwapSwapper
            let InvalidSwapper = await ethers.getContractFactory("SushiSwapSwapper");
            let invalidSwapper = await InvalidSwapper.deploy(bentoBox.address, uniswapV2Factory.address, await uniswapV2Factory.pairCodeHash())
            await invalidSwapper.deployed();

            await expect(
                pairHelper.contract
                    .connect(bob)
                    .liquidate([alice.address], [getBigNumber(20, 8)], invalidSwapper.address, invalidSwapper.address, false)
            ).to.be.revertedWith("KashiPair: Invalid swapper")
        })
    })

    describe("Withdraw Fees", function () {
        it("should allow to withdraw fees", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.repay(getBigNumber(50, 8)),
            ])
            await expect(pairHelper.contract.withdrawFees()).to.emit(pairHelper.contract, "LogWithdrawFees")
        })

        it("should emit events even if dev fees are empty", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
            ])

            let part = await pairHelper.contract.userBorrowPart(alice.address)

            await pairHelper.run((cmd) => [cmd.repay(part)])
            await pairHelper.contract.withdrawFees()
            await expect(pairHelper.contract.withdrawFees()).to.emit(pairHelper.contract, "LogWithdrawFees")
        })
    })

    describe("Set Fee To", function () {
        it("Mutates fee to", async function () {
            await kashiPairContract.setFeeTo(bob.address)
            expect(await kashiPairContract.feeTo()).to.be.equal(bob.address)
            expect(await pairHelper.contract.feeTo()).to.be.equal(ADDRESS_ZERO)
        })

        it("Emit LogFeeTo event if dev attempts to set fee to", async function () {
            await expect(kashiPairContract.setFeeTo(bob.address)).to.emit(kashiPairContract, "LogFeeTo").withArgs(bob.address)
        })

        it("Reverts if non-owner attempts to set fee to", async function () {
            await expect(kashiPairContract.connect(bob).setFeeTo(bob.address)).to.be.revertedWith("caller is not the owner")
            await expect(pairHelper.contract.connect(bob).setFeeTo(bob.address)).to.be.revertedWith("caller is not the owner")
        })
    })
})
