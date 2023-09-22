import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { PointPreComputes } from "../types/zk";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";

import {
  leafDataToAddress,
  splitToRegisters,
  EIP712Value,
  POST_CHAR_LIMIT,
} from "../utils/utils";
import AnonPill, { NounSet, nounSetToDbType } from "./anonPill";
import { ethers } from "ethers";
import { getSigPublicSignals } from "../utils/wasmPrecompute/wasmPrecompute.web";
import { PublicSignatureData } from "../utils/wasmPrecompute/wasmPrecompute.common";
import { downloadZKey } from "../utils/zkp";
import localforage from "localforage";
import axios from "axios";
import { Textarea } from "./textarea";
import { toUtf8Bytes } from "ethers/lib/utils";
import Spinner from "../components/spinner";

import { LeafPayload, PropGroupsPayload } from "../types/api";
import { useQuery } from "@tanstack/react-query";

import toast from "react-hot-toast";

interface CommentWriterProps {
  propId: number;
}

interface SignaturePostProcessingContents {
  TPreComputes: PointPreComputes;
  s: bigint[];
  U: bigint[][];
}

interface MerkleTreeProofData {
  root: string;
  pathElements: string[];
  pathIndices: string[];
}

const domain = {
  name: "heyanoun-prop-150",
  version: "1",
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

const types = {
  NounSignature: [
    { name: "propId", type: "string" },
    { name: "groupType", type: "string" },
    { name: "msgHash", type: "string" },
  ],
} as const;

const getPropGroups = async (propId: number) =>
  (
    await axios.get<PropGroupsPayload>("/api/getPropGroups", {
      params: { propId },
    })
  ).data;

const CommentWriter: React.FC<CommentWriterProps> = () => {
  const propId = -1;
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [isTimedSuccess, setTimedSucess] = useState(false);

  useEffect(() => {
    if (isTimedSuccess) {
      const timeout = setTimeout(() => {
        setTimedSucess(false);
      }, 2500);

      return () => clearTimeout(timeout);
    }
  }, [isTimedSuccess]);

  const {
    isLoading: propGroupsLoading,
    data: propGroups,
    refetch,
  } = useQuery<PropGroupsPayload>({
    queryKey: ["groups"],
    queryFn: () => getPropGroups(propId),
    retry: 1,
    enabled: true,
    staleTime: 1000,
  });

  const groupTypeToMerkleTreeProofData: { [key: string]: MerkleTreeProofData } =
    useMemo(() => {
      let ret: { [key: string]: MerkleTreeProofData } = {};
      if (propGroups) {
        for (const { root, leaves, type } of propGroups.groups) {
          const leaf = leaves.find(
            (el: LeafPayload) =>
              address &&
              leafDataToAddress(el.data).toLowerCase() === address.toLowerCase()
          );

          if (leaf) {
            ret[type] = {
              root,
              pathElements: leaf.path,
              pathIndices: leaf.indices,
            };
          }
        }

        return ret;
      } else {
        return {};
      }
    }, [propGroups, address]);

  const merkleTreeProofData = React.useRef<MerkleTreeProofData>();
  const [commentMsg, setCommentMsg] = React.useState<string>("");
  const [loadingText, setLoadingText] = React.useState<string | undefined>(
    undefined
  );

  const [successProofGen, setSuccessProofGen] = React.useState<
    boolean | undefined
  >(undefined);

  const [activeNounSet, setActiveNounSet] = useState<NounSet>(
    NounSet.SingleNoun
  );

  const { data, error, isLoading, signTypedData } = useSignTypedData({
    domain,
    types,
    value: {
      propId: `${propId}`,
      groupType: `${activeNounSet}`,
      msgHash: ethers.utils.keccak256(toUtf8Bytes(commentMsg)),
    } as const,
    async onSuccess(data, variables) {
      // Verify signature when sign message succeeds
      const { v, r, s } = ethers.utils.splitSignature(data);
      const isRYOdd = Number((BigInt(v) - BigInt(27)) % BigInt(2));

      const publicSigData = {
        r,
        isRYOdd,
        eip712Value: variables.value as EIP712Value,
      };
      const { TPreComputes, U } = await getSigPublicSignals(publicSigData);

      const signatureArtifacts: SignaturePostProcessingContents = {
        // @ts-ignore
        TPreComputes,
        U,
        s: splitToRegisters(s.substring(2)) as bigint[],
      };
      await generateProof(signatureArtifacts, publicSigData);
    },
    onError(error) {
      setLoadingText(undefined);
      toast.error("Error signing message");
    },
  });

  const generateProof = React.useCallback(
    async (
      artifacts: SignaturePostProcessingContents,
      publicSigData: PublicSignatureData
    ) => {
      if (!merkleTreeProofData.current || !merkleTreeProofData.current.root) {
        toast.error("Error occurred generating proof, please try again", {
          position: "bottom-right",
        });
        setLoadingText(undefined);
        console.error("Missing merkle tree data");
        return;
      } else if (commentMsg.length > POST_CHAR_LIMIT) {
        toast.error(
          "Comment is too long, please keep less than 600 characters!",
          {
            position: "bottom-right",
          }
        );
        setLoadingText(undefined);
        return;
      }
      //TODO: add loading state or progress bar first time it downloads zkey
      await downloadZKey();

      const proofInputs = {
        ...artifacts,
        ...merkleTreeProofData.current,
        propId: propId.toString(),
        groupType: activeNounSet.toString(),
      };

      const zkeyDb = await localforage.getItem("setMembership_final.zkey");

      if (!zkeyDb) {
        throw new Error("zkey was not found in the database");
      }

      // @ts-ignore
      const zkeyRawData = new Uint8Array(zkeyDb);

      const zkeyFastFile = { type: "mem", data: zkeyRawData };
      const worker = new Worker("./worker.js");
      worker.postMessage([proofInputs, zkeyFastFile]);
      worker.onmessage = async function (e) {
        const { proof, publicSignals } = e.data;
        console.log("PROOF SUCCESSFULLY GENERATED: ", proof);
        console.log("PUBLIC SIGNALS: ", publicSignals);

        if (!merkleTreeProofData.current) {
          throw new Error("Missing merkle tree data");
        } else {
          axios.post(
            "/api/submit",
            {
              proof,
              publicSignatureData: publicSigData,
              root: merkleTreeProofData.current.root,
              commentMsg,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          toast.success("Proof submitted successfully!", {
            position: "bottom-right",
          });
          refetch();
          setSuccessProofGen(true);
          // TODO add toast showing success and link to proof
          setTimedSucess(true);
          setCommentMsg("");
          setLoadingText(undefined);
        }
      };
    },
    [activeNounSet, commentMsg, propId, refetch]
  );

  const prepareProof = React.useCallback(async () => {
    if (commentMsg.length <= 2) {
      toast.error("Your comment is too short.", {
        position: "bottom-right",
      });
      return;
    }

    if (loadingText) {
      return;
    }

    try {
      setLoadingText("Generating proof...");
      if (!address) {
        toast.error("Please connect your wallet before trying to post!", {
          position: "bottom-right",
        });
        openConnectModal?.();
        setLoadingText(undefined);
        return;
      }

      merkleTreeProofData.current =
        groupTypeToMerkleTreeProofData[nounSetToDbType(activeNounSet)];

      // TODO: REMOVE THIS AFTER TESTING, generating dummy merkle tree to test proof generation works
      //       if you want to test non-noun holding addresses
      // const { pathElements, pathIndices, pathRoot } = await createMerkleTree(
      //   "0x926B47C42Ce6BC92242c080CF8fAFEd34a164017",
      //   [
      //     "0x926B47C42Ce6BC92242c080CF8fAFEd34a164017",
      //     "0x199D5ED7F45F4eE35960cF22EAde2076e95B253F",
      //   ]
      // );
      // const merkleTreeData = prepareMerkleRootProof(
      //   pathElements,
      //   pathIndices,
      //   pathRoot
      // );

      // triggers callback which will call generateProof when it's done
      signTypedData();
    } catch (ex: unknown) {
      setLoadingText(undefined);
      console.error(ex);
      toast.error("Unexpected error occurred, please try again", {
        position: "bottom-right",
      });
    }
  }, [activeNounSet, address, groupTypeToMerkleTreeProofData, signTypedData]);

  const canPost = React.useMemo(
    () => Object.keys(groupTypeToMerkleTreeProofData).length !== 0,
    [groupTypeToMerkleTreeProofData]
  );

  return (
    <div className="mx-auto rounded-md">
      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative overflow-clip">
          {/* Sucessful Post Overlay */}
          <AnimatePresence>
            {isTimedSuccess && (
              <motion.div
                exit={{ opacity: 0 }}
                className="bg-gray-100 rounded-lg absolute w-full h-full z-10 flex flex-col justify-center items-center"
              >
                <motion.div
                  initial={{ y: -12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  exit={{ y: 12, opacity: 0 }}
                  className="text-4xl mb-2"
                >
                  🎉
                </motion.div>
                <motion.div
                  initial={{ y: -12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 12, opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="font-semibold text-base text-gray-800 max-w-[15rem] text-center"
                >
                  Your comment has been successfully posted.
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="py-2 px-0">
            <Textarea
              value={commentMsg}
              placeholder="Add your comment..."
              onChangeHandler={(newVal) => setCommentMsg(newVal)}
            />
          </div>

          <div className="bg-gray-50 border-t border-gray-100 flex justify-end items-center p-3 space-x-2">
         </div>
          <div></div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={prepareProof}
            className="bg-black transition-all hover:bg-slate-900 hover:scale-105 active:scale-100 text-white font-semibold rounded-md px-4 py-2 mt-4"
          >
            {loadingText ? (
              <div className="mx-16 py-1">
                <Spinner />
              </div>
            ) : (
              `Post Anonymously`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentWriter;
